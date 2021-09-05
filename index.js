"use strict";
const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
function razor(html, opts) {
    let src = new razor.Parser(html, opts);
    if (opts.layout) {
        let ly = new razor.Parser(opts.layout, opts).parse(), sections = `const _s={\n${src.sections.join(',\n')}\n};\let renderSection=(v,r)=>{if(!r)return v in _s?_s[v]():'';throw "section '"+v+"' not found"};\n`, body = `let __="";let renderBody=async ()=> {let __="";${src.parse()}\nreturn __;};\n${sections}${ly} \nreturn __;`;
        return AsyncFunction(...(opts.args || []), body);
    }
    else
        return AsyncFunction(...(opts.args || []), `let __=""; ${src.parse()} \nreturn __;`);
}
(function (razor) {
    class Parser {
        constructor(src, opts) {
            this.src = src;
            this.sections = [];
            this.r = '';
            this.min = opts.min;
            this.comment = opts.comment;
        }
        join(i, i0) {
            if (i != i0) {
                if (!this.open) {
                    this.r += '\n__+=`';
                    this.open = true;
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
        search(from, regex) {
            let t = this.src.slice(from).search(regex);
            return t == -1 ? -1 : t + from;
        }
        parseHTML(from, to) {
            let t = this.src.slice(from, to);
            if (this.min) {
                t = t
                    .replace(/[\s\r\n]+/g, ' ')
                    .replace(/\> \</g, "><")
                    .replace(/" \/\>/g, '"/>')
                    .replace(/" \>/g, '">');
            }
            return t.replace(/`/g, "\\`");
        }
        testSubExp(i, end, endRgx) {
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
        testExp(i) {
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
        inScript(i) {
            while (true) {
                let i1 = this.search(i, /[\<\}]/);
                if (i1 == -1)
                    throw "invalid";
                if (this.src[i1] == '<') {
                    let t = this.src.slice(i, i1);
                    if (t.trim())
                        this.r += t;
                    i = this.inHTML(i1);
                }
                else {
                    this.r += this.src.slice(i, i1);
                    i = i1 + 1;
                    break;
                }
            }
            return i;
        }
        inHTML(i) {
            let i0 = i, level = 0;
            do {
                if ((i = this.search(i, /@|\/\>|\<|\<!--/)) >= 0)
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
                                else
                                    i0 = i = end;
                                if (!level)
                                    return i;
                                break;
                            default:
                                level++;
                        }
                    }
                    else if (this.src[i] == '/') {
                        i += 2;
                        level--;
                        if (!level) {
                            i0 = this.join(i, i0);
                            return i;
                        }
                    }
                    else if (this.src[i] == '@') {
                        switch (this.src[i + 1]) {
                            case '@':
                                i0 = this.join(i, i0) + 1;
                                i += 2;
                                break;
                            case '{':
                                i0 = this.join(i, i0);
                                this.close();
                                this.r += '\n';
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
                                }
                                else if (this.src.slice(t, t + 4) == 'for(') {
                                    this.close();
                                    i = this.testExp(t);
                                    this.r += '\n' + this.src.slice(t, i) + '{';
                                    i = this.src.indexOf('{', i) + 1;
                                    i = i0 = this.inScript(i);
                                    this.close();
                                    this.r += '\n}';
                                }
                                else if (this.src.slice(t, t + 9) == 'function ') {
                                    this.close();
                                    i = this.testExp(t += 9);
                                    this.r += `\nfunction ${this.src.slice(t, i)}{\n let __="";`;
                                    i = this.src.indexOf('{', i) + 1;
                                    i = i0 = this.inScript(i);
                                    this.close();
                                    this.r += '\nreturn __;}';
                                }
                                else if (this.src.slice(t, t + 8) == 'section ') {
                                    i = this.testExp(t += 8);
                                    let oldR = this.r, oldOpen = this.open;
                                    this.open = false;
                                    this.r = `${this.src.slice(t, i)}{\nlet __="";`;
                                    i = this.src.indexOf('{', i) + 1;
                                    i = i0 = this.inScript(i);
                                    this.close();
                                    this.r += '\nreturn __;\n}';
                                    this.sections.push(this.r);
                                    this.r = oldR;
                                    this.open = oldOpen;
                                }
                                else if (this.src.slice(t, t + 6) == 'while(') {
                                    this.close();
                                    throw "not implemented";
                                }
                                else if (this.src.slice(t, i) == 'do') {
                                    this.close();
                                    throw "not implemented";
                                }
                                else {
                                    this.r += '${' + this.src.slice(i0 + 1, i == -1 ? undefined : i) + '}';
                                    i0 = i;
                                }
                            }
                        }
                    }
                    else {
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
            do
                i = this.inHTML(i);
            while (i != -1);
            this.close();
            return this.r;
        }
    }
    razor.Parser = Parser;
})(razor || (razor = {}));
module.exports = razor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLGNBQWMsQ0FBQyxLQUFLLGVBQWUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFBO0FBQzlFLFNBQVMsS0FBSyxDQUFjLElBQVksRUFBRSxJQUFtQjtJQUMzRCxJQUFJLEdBQUcsR0FBRyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRXZDLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtRQUNmLElBQ0UsRUFBRSxHQUFHLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUNoRCxRQUFRLEdBQUcsZUFBZSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsc0dBQXNHLEVBQ3hKLElBQUksR0FBRyxrREFBa0QsR0FBRyxDQUFDLEtBQUssRUFBRSxtQkFBbUIsUUFBUSxHQUFHLEVBQUUsZUFBZSxDQUFDO1FBRXRILE9BQXNCLGFBQWEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztLQUNqRTs7UUFDQyxPQUFzQixhQUFhLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLEVBQUUsY0FBYyxHQUFHLENBQUMsS0FBSyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0FBQ3hHLENBQUM7QUFDRCxXQUFPLEtBQUs7SUFRVixNQUFhLE1BQU07UUFNakIsWUFBbUIsR0FBVyxFQUFFLElBQWE7WUFBMUIsUUFBRyxHQUFILEdBQUcsQ0FBUTtZQUQ5QixhQUFRLEdBQWEsRUFBRSxDQUFDO1lBRXRCLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFBO1lBQ1gsSUFB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