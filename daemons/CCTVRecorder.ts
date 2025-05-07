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
            this.recorderLoop(index, this);
        }
    }
    stop(){for(const item of this.variables.threads){clearTimeout(item);}}
    receiver(from:string, signal:string, data:any, ID:string){}


    async recordFunc(index:number, sourceUrl:string, saveDirectory:string, daemonObj:CCTVRecorder){
        let dateObj = new Date();
        let filename = `${dateObj.getHours()}_${dateObj.getMinutes()}_${dateObj.getSeconds()}_${randomUUID()}.mkv`;
        daemonObj.sender("SystemCTL", "runSh", `ffmpeg -i "${sourceUrl}" -c copy -t ${daemonObj.config[index].clipLengthInSec} "${saveDirectory}/${filename}"`, undefined, async(returnValue:{response:string, success:boolean})=>{
            daemonObj.variables.threads[index]=setTimeout(daemonObj.recorderLoop, 1000, index, daemonObj);
        });

        // Live Playback with MPV
        setTimeout(()=>{
            daemonObj.sender("SystemCTL", "runSh", `mpv "${saveDirectory}/${filename}"`);
        }, 8000); // Playback Delay
    }
    async recorderLoop(index:number, daemonObj:CCTVRecorder){
        let dateObj = new Date();

        let saveDirectory = `${daemonObj.config[index].saveDirectory}/${daemonObj.config[index].label||daemonObj.config.indexOf(daemonObj.config[index])}/${dateObj.getFullYear()}_${dateObj.getMonth()}_${dateObj.getMonth()+1}_${dateObj.getDate()}`;
        daemonObj.sender("SystemCTL", "runSh", `mkdir -p "${saveDirectory}"`, undefined, async(returnValue:{response:string, success:boolean})=>{
            if (returnValue.success){
                if (daemonObj.config[index].MACAddress){
                    try{
                        let DHCPRes = await fetch("http://192.168.0.1/dhcp_clients.asp", {mode: "no-cors"});
                        if (DHCPRes.ok){
                            try{
                                let dhcpClients = new XMLParser().parse(await DHCPRes.text()).dhcp_clients.client;
                                let clientIP:string|undefined=undefined;
    
                                for (let clientIndex=0;clientIndex<dhcpClients.length;clientIndex++){
                                    if(dhcpClients[clientIndex].mac==daemonObj.config[index].MACAddress){
                                        clientIP=dhcpClients[clientIndex].ip_address;
                                        break
                                    }
                                }
    
                                if (typeof(clientIP)=="string"){
                                    daemonObj.recordFunc(index, daemonObj.config[index].sourceUrl.replaceAll("{IP}", clientIP), saveDirectory, daemonObj);
                                }else{
                                    daemonObj.pushLog(`CRITICAL: ${daemonObj.config[index].label||daemonObj.config.indexOf(daemonObj.config[index])} IP Couldn't be located from MAC!`, false);
                                    daemonObj.variables.threads[index]=setTimeout(daemonObj.recorderLoop, 10*60*1000, index, daemonObj);
                                }
                            }catch(e){
                                daemonObj.pushLog(`CRITICAL: ${daemonObj.config[index].label||daemonObj.config.indexOf(daemonObj.config[index])} Couldn't parse DHCP list!`, false);
                                daemonObj.variables.threads[index]=setTimeout(daemonObj.recorderLoop, 10*60*1000, index, daemonObj);
                            }
                        }else{
                            daemonObj.pushLog(`CRITICAL: ${daemonObj.config[index].label||daemonObj.config.indexOf(daemonObj.config[index])} Couldn't retrieve DHCP list from router!`, false);
                            daemonObj.variables.threads[index]=setTimeout(daemonObj.recorderLoop, 10*60*1000, index, daemonObj);
                        }
                    }catch(e){
                        daemonObj.pushLog(`CRITICAL: ${daemonObj.config[index].label||daemonObj.config.indexOf(daemonObj.config[index])} Couldn't retrieve MAC list from router!`, false);
                        daemonObj.variables.threads[index]=setTimeout(daemonObj.recorderLoop, 10*60*1000, index, daemonObj);
                    }
                }else{
                    daemonObj.recordFunc(index, daemonObj.config[index].sourceUrl, saveDirectory, daemonObj);
                }
            }else{
                daemonObj.pushLog(`CRITICAL: ${daemonObj.config[index].label||daemonObj.config.indexOf(daemonObj.config[index])} Save location couldn't be initialized!`, false);
                daemonObj.variables.threads[index]=setTimeout(daemonObj.recorderLoop, 10*60*1000, index, daemonObj);
            }
        });
    }
}