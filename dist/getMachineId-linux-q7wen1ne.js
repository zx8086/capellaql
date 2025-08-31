// @bun
import{d as B}from"./index-t2bwpaq6.js";import{f as z,h as A}from"./index-32sm2skh.js";var F=z((k)=>{Object.defineProperty(k,"__esModule",{value:!0});k.getMachineId=void 0;var C=A("fs"),D=B();async function E(){let v=["/etc/machine-id","/var/lib/dbus/machine-id"];for(let w of v)try{return(await C.promises.readFile(w,{encoding:"utf8"})).trim()}catch(b){D.diag.debug(`error reading machine id: ${b}`)}return}k.getMachineId=E});export default F();

//# debugId=5B64C65EADE95BD164756E2164756E21
//# sourceMappingURL=getMachineId-linux-q7wen1ne.js.map
