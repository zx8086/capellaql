// @bun
import{b as D}from"./index-jphz1ne5.js";import{d as C}from"./index-t2bwpaq6.js";import{f as B}from"./index-32sm2skh.js";var H=B((q)=>{Object.defineProperty(q,"__esModule",{value:!0});q.getMachineId=void 0;var E=D(),F=C();async function G(){try{let f=(await(0,E.execAsync)('ioreg -rd1 -c "IOPlatformExpertDevice"')).stdout.split(`
`).find((z)=>z.includes("IOPlatformUUID"));if(!f)return;let k=f.split('" = "');if(k.length===2)return k[1].slice(0,-1)}catch(b){F.diag.debug(`error reading machine id: ${b}`)}return}q.getMachineId=G});export default H();

//# debugId=9CE7DDE1D8DB29EA64756E2164756E21
//# sourceMappingURL=getMachineId-darwin-e4f071an.js.map
