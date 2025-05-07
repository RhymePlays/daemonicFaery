import { DaemonicDaemon } from "../daemonicFaery.ts";
import { randomUUID } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export class CCTVRecorder extends DaemonicDaemon{
    /*--------------------------------*\
    Daemon Dependencies: SystemCTL, DaemonicPing

    Daemon Config: [
        {
            label: [string],
            clipLengthInSec: [number],
            sourceUrl: "rtsp://admin:admin123456@{IP}/ch=1?subtype=0",
            MACAddress: [string] || [undefined],
            saveDirectory: [string],
        }
    ]

    Daemon Usage:
    
    \*--------------------------------*/
    onLoad(){
        this.variables["threads"]={};
    }
    start(){
        for (let index=0;index<this.config.length;index++){
            this.recorderLoop(index);
        }
    }
    stop(){for(const item of this.variables.threads){clearTimeout(item);}}
    receiver(from:string, signal:string, data:any, ID:string){}


    recordFunc(index:number, sourceUrl:string, saveDirectory:string){
        let dateObj = new Date();
        this.sender("SystemCTL", "runSh", `ffmpeg -i "${sourceUrl}" -c copy -t ${this.config[index].clipLengthInSec} "${saveDirectory}/${dateObj.getHours()}_${dateObj.getMinutes()}_${dateObj.getSeconds()}_${randomUUID()}.mkv"`, undefined, (returnValue:{response:string, success:boolean})=>{
            if (returnValue.success){
                this.variables.threads[index]=setTimeout(this.recorderLoop, (this.config[index].clipLengthInSec+1)*1000, index);
            }else{
                this.pushLog(`CRITICAL: ${this.config[index].label||this.config.indexOf(this.config[index])} Couldn't record!`, false);
                this.variables.threads[index]=setTimeout(this.recorderLoop, 10*60*1000, index);
            }
        });
    }
    async recorderLoop(index:number){
        let dateObj = new Date();
        let saveDirectory = `${this.config[index].saveDirectory}/${this.config[index].label||this.config.indexOf(this.config[index])}/${dateObj.getFullYear()}_${dateObj.getMonth()}_${dateObj.getMonth()+1}_${dateObj.getDate()}`;
        this.sender("SystemCTL", "runSh", `mkdir -p "${saveDirectory}"`, undefined, async(returnValue:{response:string, success:boolean})=>{
            if (returnValue.success){
                if (this.config[index].MACAddress){
                    try{
                        let DHCPRes = await fetch("http://192.168.0.1/dhcp_clients.asp", {mode: "no-cors"});
                        if (DHCPRes.ok){
                            try{
                                let dhcpClients = new XMLParser().parse(await DHCPRes.text()).dhcp_clients.client;
                                let clientIP:string|undefined=undefined;
    
                                for (let clientIndex=0;clientIndex<dhcpClients.length;clientIndex++){
                                    if(dhcpClients[clientIndex].mac==this.config[index].MACAddress){
                                        clientIP=dhcpClients[clientIndex].ip_address;
                                        break
                                    }
                                }
    
                                if (typeof(clientIP)=="string"){
                                    this.recordFunc(index, this.config[index].sourceUrl.replaceAll("{IP}", clientIP), saveDirectory);
                                }else{
                                    this.pushLog(`CRITICAL: ${this.config[index].label||this.config.indexOf(this.config[index])} IP Couldn't be located from MAC!`, false);
                                    this.variables.threads[index]=setTimeout(this.recorderLoop, 10*60*1000, index);
                                }
                            }catch(e){
                                this.pushLog(`CRITICAL: ${this.config[index].label||this.config.indexOf(this.config[index])} Couldn't parse DHCP list!`, false);
                                this.variables.threads[index]=setTimeout(this.recorderLoop, 10*60*1000, index);
                            }
                        }else{
                            this.pushLog(`CRITICAL: ${this.config[index].label||this.config.indexOf(this.config[index])} Couldn't retrieve DHCP list from router!`, false);
                            this.variables.threads[index]=setTimeout(this.recorderLoop, 10*60*1000, index);
                        }
                    }catch(e){
                        this.pushLog(`CRITICAL: ${this.config[index].label||this.config.indexOf(this.config[index])} Couldn't retrieve MAC list from router!`, false);
                        this.variables.threads[index]=setTimeout(this.recorderLoop, 10*60*1000, index);
                    }
                }else{
                    this.recordFunc(index, this.config[index].sourceUrl, saveDirectory);
                }
            }else{
                this.pushLog(`CRITICAL: ${this.config[index].label||this.config.indexOf(this.config[index])} Save location couldn't be initialized!`, false);
                this.variables.threads[index]=setTimeout(this.recorderLoop, 10*60*1000, index);
            }
        });
    }
}