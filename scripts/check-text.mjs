import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "./target-process.mjs";
import {fileURLToPath} from "node:url";
import ts from "typescript";

export function textProblems(text) {
  const problems=[];
  if(text.includes("\uFFFD"))problems.push("replacement character U+FFFD");
  if(/(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2[\u0080-\u00bf\u20ac\u2018-\u2022])/u.test(text))problems.push("probable mojibake");
  // Strip URLs first: query strings and paths are not natural-language words.
  if(/\p{L}\?+\p{L}/u.test(text.replace(/(?:https?:\/\/|\/)[^\s"'<>]+/g,"")))problems.push("question mark inside a word");
  return problems;
}

export function checkText(root=process.cwd()) {
  const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{cwd:root}).toString().split("\0").filter(Boolean);
  const errors=[];const catalog=JSON.parse(fs.readFileSync(path.join(root,"src/lib/i18n/es.json"),"utf8"));
  const fail=(file,line,message)=>errors.push(`${file}:${line}: ${message}`);
  const catalogAst=ts.parseJsonText("es.json",fs.readFileSync(path.join(root,"src/lib/i18n/es.json"),"utf8"));
  const keys=new Set();
  for(const property of catalogAst.statements[0].expression.properties){
    const key=property.name.text;
    if(keys.has(key))fail("src/lib/i18n/es.json",1,`Duplicate translation key: ${key}`);
    keys.add(key);
  }
  for(const [source,target] of Object.entries(catalog)){
    if(!source.trim()||typeof target!=="string"||!target.trim())fail("src/lib/i18n/es.json",1,"Both Portuguese source and Spanish target are required");
    if(JSON.stringify(source.match(/\{\d+\}/g)??[])!==JSON.stringify(String(target).match(/\{\d+\}/g)??[]))fail("src/lib/i18n/es.json",1,`Placeholder mismatch: ${source}`);
  }
  let checked=0;
  for(const file of files){
    if(!/\.(?:tsx?|jsx?|mjs|cjs|json|css|md|sql|ya?ml|toml|txt|svg|html)$/.test(file)&&!['.gitignore','.env.example'].includes(file))continue;
    if(!fs.existsSync(path.join(root,file)))continue;
    const bytes=fs.readFileSync(path.join(root,file));let source;
    try{source=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{fail(file,1,"Invalid UTF-8 bytes");continue;}
    checked++;
    if(source.includes("\0"))fail(file,1,"NUL byte in text file (possible UTF-16 encoding)");
    source.split(/\r?\n/).forEach((line,i)=>{for(const problem of textProblems(line).filter(p=>p!=="question mark inside a word"))fail(file,i+1,problem);});
    if(file==="src/lib/i18n/es.json"){
      for(const [key,value] of Object.entries(catalog))for(const text of [key,value])for(const issue of textProblems(text))fail(file,1,`${issue}: ${text}`);
    }else if(/^src\//.test(file.replaceAll("\\","/"))&&/\.[cm]?[jt]sx?$/.test(file)){
      const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith("tsx")?ts.ScriptKind.TSX:undefined);
      function visit(node){
        if(ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)||ts.isJsxText(node)){
          const text=node.text;
          for(const issue of textProblems(text))fail(file,ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,`${issue}: ${text}`);
          const parent=node.parent;
          if(ts.isCallExpression(parent)&&parent.arguments[0]===node&&parent.expression.getText(ast)==="t"&&text.trim()&&!Object.hasOwn(catalog,text.trim().replace(/\s+/g," ")))fail(file,ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,`Missing Spanish translation: ${text}`);
        }
        ts.forEachChild(node,visit);
      }visit(ast);
    }
  }
  return {checked,errors};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=checkText();for(const error of result.errors)console.error(error);
  console.log(`Text check: ${result.checked} UTF-8 files; ${result.errors.length} issues.`);process.exitCode=result.errors.length?1:0;
}
