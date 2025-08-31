// @bun
import{d as z}from"./index-t2bwpaq6.js";import{e as w}from"./index-32sm2skh.js";var k=w(z(),1);import{promises as A}from"fs";async function C(){let q=["/etc/machine-id","/var/lib/dbus/machine-id"];for(let v of q)try{return(await A.readFile(v,{encoding:"utf8"})).trim()}catch(b){k.diag.debug(`error reading machine id: ${b}`)}return}export{C as getMachineId};

//# debugId=7769417E55D5EDE664756E2164756E21
//# sourceMappingURL=getMachineId-linux-7npv224b.js.map
