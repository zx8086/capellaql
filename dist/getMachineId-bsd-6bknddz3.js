// @bun
import{b as D}from"./index-jphz1ne5.js";import{d as C}from"./index-t2bwpaq6.js";import{f as z,h as B}from"./index-32sm2skh.js";var H=z((v)=>{Object.defineProperty(v,"__esModule",{value:!0});v.getMachineId=void 0;var E=B("fs"),F=D(),q=C();async function G(){try{return(await E.promises.readFile("/etc/hostid",{encoding:"utf8"})).trim()}catch(k){q.diag.debug(`error reading machine id: ${k}`)}try{return(await(0,F.execAsync)("kenv -q smbios.system.uuid")).stdout.trim()}catch(k){q.diag.debug(`error reading machine id: ${k}`)}return}v.getMachineId=G});export default H();

//# debugId=586126F8FB0D9B3C64756E2164756E21
//# sourceMappingURL=getMachineId-bsd-6bknddz3.js.map
