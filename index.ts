
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor
function razor<T = unknown>(html: string, opts: razor.Options): razor.View<T> {
  let src = new razor.Parser(html, opts);

  if (opts.layout) {
    let
      ly = new razor.Parser(opts.layout, opts).parse(),
      sections = `const _s={\n${src.sections.join(',\n')}\n};\let renderSection=(v,r)=>{if(!r)return v in _s?_s[v]():'';throw "section '"+v+"' not found"};\n`,
      body = `let __="";let renderBody=async ()=> {let __="";${src.parse()}\nreturn __;};\n${sections}${ly} \nreturn __;`;

    return <razor.View<T>>AsyncFunction(...(opts.args || []), body);
  } else
    return <razor.View<T>>AsyncFunction(...(opts.args || []), `let __=""; ${src.parse()} \nreturn __;`);
}
module razor {
  export type View<T = unknown> = (this: T, ...args: any[]) => Promise<string>;
  export interface Options {
    layout?: string;
    min?: boolean;
    comment?: boolean;
    args?: string[];
  }
  export class Parser {
    min: boolean;
    comment: boolean;
    r: string;
    open?: boolean
    sections: string[] = [];
    constructor(public src: string, opts: Options) {
      this.r = ''// 'let __="";';
      this.min = opts.min;
      this.comment = opts.comment;
    }

    join(i: number, i0: number) {
      if (i != i0) {
        if (!this.open) {
          this.r += '\n__+=`'; this.open = true;
        }
        this.r += this.parseHTML(i0, i == -1 ? undefined : i);
        return i;
      }
      return i0;
    }
    close() {
      if (this.open) {
        this.r += '`;';
        this.open = false;
      }
    }
    search(from: number, regex: string | RegExp) {
      let t = this.src.slice(from).search(regex);
      return t == -1 ? -1 : t + from;
    }
    parseHTML(from: number, to?: number) {
      let t = this.src.slice(from, to);
      if (this.min) {
        t = t
          .replace(/[\s\r\n]+/g, ' ')
          .replace(/\> \</g, "><")
          .replace(/" \/\>/g, '"/>')
          .replace(/" \>/g, '">')

      }
      return t.replace(/`/g, "\\`");
    }

    testSubExp(i: number, end: string, endRgx: string) {

      do {
        if ((i = this.search(i, `[\\(\\["'\`${endRgx}]`)) == -1)
          throw "invalid expression";

        if (this.src[i] == end)
          return i + end.length;

        switch (this.src[i]) {
          case '[':
            i = this.testSubExp(i + 1, ']', '\]');
            break;
          case '(':
            i = this.testSubExp(i + 1, ')', '\)');
            break;
          case '"':
            i = this.testSubExp(i + 1, '"', '');
            break;
          case "'":
            i = this.testSubExp(i + 1, "'", '');
            break;
          case "`":
            i = this.testSubExp(i + 1, "`", '');
            break;
        }
      } while (true);
    }
    testExp(i: number) {
      //[,{,(,nl, ,\,/,@
      i = this.search(i, /[\(\[\s\r\n\<"@/\\]/);

      switch (this.src[i]) {
        case '[':
          return this.testSubExp(i + 1, ']', '\\]');
        case '(':
          return this.testSubExp(i + 1, ')', '\\)');
        default:
          return i;
      }
    }

    protected inScript(i: number): number {
      //this.r += '{';
      while (true) {
        let i1 = this.search(i, /[\<\}]/);
        if (i1 == -1)
          throw "invalid";
        if (this.src[i1] == '<') {
          let t = this.src.slice(i, i1);
          if (t.trim())
            this.r += t;
          //let end = this.src.indexOf('}', i1);
          i = this.inHTML(i1/*, end*/);
          //i = end + 1;
        } else {
          this.r += this.src.slice(i, i1);
          i = i1 + 1;
          break;
        }
      }
      //this.r += '\n}';
      return i;
    }

    protected inHTML(i: number) {

      //this.join(i, i0);
      //this.close();
      let i0 = i, level = 0;
      do {
        /*
         @any
         any/>
         <any
         <!--any
         <script
         */
        if ((i = this.search(i, /@|\/\>|\<|\<!--/)) >= 0)//|\<script
          //if (i >= end) {
          //  i = end - 1;
          //  break;
          //} else
          if (this.src[i] == '<') {
            i++;
            switch (this.src[i]) {
              case '/':
                i = this.search(i, /\>/) + 1;
                i0 = this.join(i, i0);
                i++;
                if (!i)
                  throw "invalid";

                if (!--level)
                  return i;

                break;
              case '!':
                i0 = this.join(i - 1, i0);
                let end = this.src.indexOf('-->', i) + 3;
                if (this.comment)
                  i0 = this.join(i, i0);

                else i0 = i = end;// this.src = this.src.slice(0, --i) + this.src.slice(end);

                if (!level)
                  return i;

                break;

              default:
                level++;
            }

          } else if (this.src[i] == '/') {
            i += 2;
            level--;

            if (!level) {
              i0 = this.join(i, i0);
              return i;
            }
          } else if (this.src[i] == '@') {
            switch (this.src[i + 1]) {
              case '@':
                i0 = this.join(i, i0) + 1;
                i += 2;
                break;
              case '{':
                i0 = this.join(i, i0);
                this.close();
                this.r += '\n';
                //+2 para pular a  @{
                i = i0 = this.inScript(i += 2);
                break;
              default: {

                let t = i + 1;
                i0 = this.join(i, i0);
                i = this.testExp(t);
                if (this.src.slice(t, t + 3) == 'if(') {
                  this.close();
                  this.r += `\n${this.src.slice(t, i)}{`;
                  i = this.src.indexOf('{', i) + 1;
                  i = i0 = this.inScript(i);

                  if (this.src.slice(i, i + 5) == 'else{') {
                    this.close();
                    this.r += '}else{';
                    i = i0 = this.inScript(i + 5);
                    this.close();
                    this.r += '\n}';
                  }
                  this.close();
                  this.r += '\n}';

                } else if (this.src.slice(t, t + 4) == 'for(') {
                  this.close();
                  i = this.testExp(t);
                  this.r += '\n' + this.src.slice(t, i) + '{';
                  i = this.src.indexOf('{', i) + 1;
                  i = i0 = this.inScript(i);
                  this.close();
                  this.r += '\n}';

                } else if (this.src.slice(t, t + 9) == 'function ') {
                  this.close();
                  i = this.testExp(t += 9);
                  this.r += `\nfunction ${this.src.slice(t, i)}{\n let __="";`;
                  i = this.src.indexOf('{', i) + 1;
                  i = i0 = this.inScript(i);
                  this.close();
                  this.r += '\nreturn __;}';


                } else if (this.src.slice(t, t + 8) == 'section ') {
                  i = this.testExp(t += 8);
                  let
                    oldR = this.r,
                    oldOpen = this.open;

                  this.open = false;
                  this.r = `${this.src.slice(t, i)}{\nlet __="";`;
                  i = this.src.indexOf('{', i) + 1;
                  i = i0 = this.inScript(i);
                  this.close();
                  this.r += '\nreturn __;\n}';
                  this.sections.push(this.r);

                  this.r = oldR;
                  this.open = oldOpen;

                } else if (this.src.slice(t, t + 6) == 'while(') {
                  this.close();
                  throw "not implemented";
                } else if (this.src.slice(t, i) == 'do') {
                  this.close();
                  throw "not implemented";
                } else {
                  this.r += '${' + this.src.slice(i0 + 1, i == -1 ? undefined : i) + '}';
                  i0 = i;
                }
              }
            }

          } else {
            //TODO chechar script
            i = this.src.indexOf('</script>', i);
          }

      } while (i != -1);
      return i;
    }
    parse() {
      let i = 0;
      if (this.src.startsWith('<!')) {
        i = this.join(this.src.indexOf('>'), 0);
      }
      do i = this.inHTML(i);
      while (i != -1);
      this.close();

      //this.r += '\nreturn __;\n';
      return this.r;
    }
  }
}
export =razor;
