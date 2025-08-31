// @bun
import{b as E}from"./index-jphz1ne5.js";import{d as D}from"./index-t2bwpaq6.js";import{f as B,h as C}from"./index-32sm2skh.js";var J=B((v)=>{Object.defineProperty(v,"__esModule",{value:!0});v.getMachineId=void 0;var q=C("process"),F=E(),G=D();async function H(){let b="%windir%\\System32\\REG.exe";if(q.arch==="ia32"&&"PROCESSOR_ARCHITEW6432"in q.env)b="%windir%\\sysnative\\cmd.exe /c "+b;try{let k=(await(0,F.execAsync)(`${b} QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid`)).stdout.split("REG_SZ");if(k.length===2)return k[1].trim()}catch(f){G.diag.debug(`error reading machine id: ${f}`)}return}v.getMachineId=H});export default J();

//# debugId=6C1458F05C38104764756E2164756E21
//# sourceMappingURL=getMachineId-win-td8v12t4.js.map
