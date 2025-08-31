// @bun
import{c as q}from"./index-1nq6dbgk.js";import{d as C}from"./index-t2bwpaq6.js";import{e as B}from"./index-32sm2skh.js";var v=B(C(),1);async function E(){try{let f=(await q('ioreg -rd1 -c "IOPlatformExpertDevice"')).stdout.split(`
`).find((z)=>z.includes("IOPlatformUUID"));if(!f)return;let k=f.split('" = "');if(k.length===2)return k[1].slice(0,-1)}catch(b){v.diag.debug(`error reading machine id: ${b}`)}return}export{E as getMachineId};

//# debugId=5DD7DAD750BA243664756E2164756E21
//# sourceMappingURL=getMachineId-darwin-4hfass9w.js.map
