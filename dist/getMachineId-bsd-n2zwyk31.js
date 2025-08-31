// @bun
import{c as v}from"./index-1nq6dbgk.js";import{d as z}from"./index-t2bwpaq6.js";import{e as w}from"./index-32sm2skh.js";import{promises as B}from"fs";var q=w(z(),1);async function E(){try{return(await B.readFile("/etc/hostid",{encoding:"utf8"})).trim()}catch(k){q.diag.debug(`error reading machine id: ${k}`)}try{return(await v("kenv -q smbios.system.uuid")).stdout.trim()}catch(k){q.diag.debug(`error reading machine id: ${k}`)}return}export{E as getMachineId};

//# debugId=13A2A2D8FB8C975264756E2164756E21
//# sourceMappingURL=getMachineId-bsd-n2zwyk31.js.map
