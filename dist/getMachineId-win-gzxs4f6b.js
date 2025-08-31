// @bun
import{c as v}from"./index-1nq6dbgk.js";import{d as C}from"./index-t2bwpaq6.js";import{e as B}from"./index-32sm2skh.js";import*as b from"process";var z=B(C(),1);async function F(){let f="%windir%\\System32\\REG.exe";if(b.arch==="ia32"&&"PROCESSOR_ARCHITEW6432"in b.env)f="%windir%\\sysnative\\cmd.exe /c "+f;try{let q=(await v(`${f} QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid`)).stdout.split("REG_SZ");if(q.length===2)return q[1].trim()}catch(k){z.diag.debug(`error reading machine id: ${k}`)}return}export{F as getMachineId};

//# debugId=D633529D2BB6947664756E2164756E21
//# sourceMappingURL=getMachineId-win-gzxs4f6b.js.map
