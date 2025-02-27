import { DaemonicDaemon } from "../daemonicFaery.ts";

export class RestAPI extends DaemonicDaemon {
    /*--------------------------------*\
    webRequest Structure: address:port/webSignal?parameter1=value1&parameter2=value2

    Daemon Config: {
        port: [number] Determines on which port to host the server.
        maxWebResponseTimeoutMS: [number] Time to wait before it is assumed the daemon can't/won't respond for a 'webSignal' that is expecting response.
        defaultResponse: [string] Value to send as response if a listen job exists for url parameter 'webSignal' but no response is expected to be sent from the daemon.
        timeoutResponse: [string] Value to respond with if a listen job was found for url parameter 'webSignal' and a custom response is expected but not fulfiled within the time 'maxWebResponseTimeoutMS'. 
        notFoundResponse: [string] Value to respond with if no listen job was found for url parameter 'webSignal'.
        insufficientParametersResponse: [string] Value to respond with if the request didn't pass all t6he mandatory parameters.
    }
    
    Daemon Usage:
    1) From other daemons call to register a new listen job: this.sender("RestAPI", "addListener", {
        webSignal: [string] unique value for webSignal parameter.
        returnWithSignal: [string] upon valid webRequest, this is the signal with which this daemon will send a sender() request to the 'daemon' daemon.
        willRespond: [boolean] determines if this daemon should wait for a response after a valid webRequest.
        description: [string] gives a run-down of what the webSignal does.
        mandatoryParams: [array] [parameter1, parameter2]
        optionalParams: [array] [parameter3, parameter4]
    });
    2) Submit a webResponse: this.sender("RestAPI", "sendWebResponse", {
        webSignal: [string] unique value for webSignal parameter.
        webResponse: [string] string to send as response to the webRequest.
        isHTML: [boolean] determines if this daemon should wait for a response after a valid webRequest.
    });
    3) getListeners: this.sender("RestAPI", "getListeners", undefined, undefined, (data)=>{});
    \*--------------------------------*/
    start(){
        this.variables["listenJob"]={};
        this.variables["httpServer"]=Bun.serve({
            port: this.config.port||80,
            fetch: async (req)=>{
                let urlObj=new URL(req.url);
                let webSignal=urlObj.pathname.split("/")[1];
                if (webSignal in this.variables.listenJob){
                    let listenItem = this.variables.listenJob[webSignal];
                    
                    let allMandatoryParamsPresent:boolean=true;
                    for (let index in listenItem.mandatoryParams){
                        if (urlObj.searchParams.get(listenItem.mandatoryParams[index])==null){allMandatoryParamsPresent=false;}
                    }

                    if (allMandatoryParamsPresent){
                        this.pushLog(`webSignal '${webSignal}' called`);
                        this.sender(listenItem.daemon, listenItem.respondWithSignal, urlObj.searchParams);
                        if (listenItem.willRespond){
                            let webResponseObj:{webResponse:string,isHTML:boolean} = await new Promise((resolve)=>{this.waitForWebResponse(webSignal, resolve);})
                            return new Response(
                                webResponseObj.webResponse,
                                {headers:{"content-type":webResponseObj.isHTML?"text/html;charset=utf-8":"text/plain;charset=utf-8"}}
                            );
                        }else{
                            return new Response(
                                this.config.defaultResponse||"200",
                                {headers:{"content-type":this.config.defaultResponse?"text/html;charset=utf-8":"text/plain;charset=utf-8"}}
                            );
                        }
                    }else{
                        return new Response(
                            this.config.insufficientParametersResponse||"400",
                            {headers:{"content-type":this.config.insufficientParametersResponse?"text/html;charset=utf-8":"text/plain;charset=utf-8"}}
                        );
                    }
                }else{
                    return new Response(
                        this.config.notFoundResponse||"404",
                        {headers:{"content-type":this.config.notFoundResponse?"text/html;charset=utf-8":"text/plain;charset=utf-8"}}

                    );
                }
            }
        });
    }
    stop(){this.variables["httpServer"].stop();}

    waitIter=0;
    waitForWebResponse(webSignal:string, resolve:Function){
        setTimeout(()=>{
            if ("webResponseObj" in this.variables.listenJob[webSignal]){
                let webResponseObj = this.variables.listenJob[webSignal]["webResponseObj"];
                delete this.variables.listenJob[webSignal]["webResponseObj"];

                this.pushLog(`webSignal '${webSignal}' was responded successfully.`);
                resolve({webResponse: webResponseObj.webResponse||"", isHTML: webResponseObj.isHTML||false});
            }else if (this.waitIter<(this.config.maxWebResponseTimeoutMS||3000)/200){
                this.waitIter=this.waitIter+1;this.waitForWebResponse(webSignal, resolve);
            }else{
                this.pushLog(`webSignal '${webSignal}' response timed out.`, false);
                resolve({webResponse: this.config.timeoutResponse||"408", isHTML: this.config.timeoutResponse?true:false});
            }
        }, 200);
    }

    receiver(from:string, signal:string, data:any, ID:string){
        if(signal=="addListener" && ("webSignal" in data)){
            this.pushLog(`webSignal '${data.webSignal}' registered by '${from}'`);
            this.variables.listenJob[data.webSignal]={
                daemon: from,
                respondWithSignal: data.respondWithSignal||"",
                willRespond: data.willRespond||false,
                description: data.description||"",
                mandatoryParams: data.mandatoryParams||[],
                optionalParams: data.optionalParams||[]
            };
        }else if(signal=="removeListener"){
            this.pushLog(`webSignal '${data}' unregistered by '${from}'`);
            delete this.variables.listenJob[data];
        }else if(signal=="getListeners"){
            this.pushLog(`Listeners sent to '${from}'`);
            this.sender(from, "RestAPIListeners", this.variables.listenJob, ID);
        }else if(signal=="sendWebResponse"){
            this.variables.listenJob[data.webSignal]["webResponseObj"]=data||{};
        }
    }
}
// ToDo: use async Response

export class WebCTL extends DaemonicDaemon {
    /*--------------------------------*\
    Daemon Dependencies: RestAPI

    Daemon Config: {pageHTML: HTML code in string. RestAPI listeners will be injected at [INJECTJSON] as JSON.}

    Daemon Usage:
    
    \*--------------------------------*/
    async start(){
        let pageFile = Bun.file(this.config.pageLocation);
        this.variables.pageHTML = await pageFile.exists()?await pageFile.text():"[INJECTJSON]";
        
        this.sender("RestAPI", "addListener", {
            webSignal: "",
            respondWithSignal: "pageRequested",
            willRespond: true
        });
    }
    stop(){this.sender("RestAPI", "removeListener", "");}
    receiver(from:string, signal:string, data:any, ID:string){
        if (signal=="pageRequested"){
            this.sender("RestAPI", "getListeners", {}, undefined, (data:object)=>{this.variables.listeners=data;});
            this.sender("RestAPI", "sendWebResponse", {
                webSignal: "",
                webResponse: this.variables.pageHTML.replace("[INJECTJSON]", JSON.stringify({
                    faeryStatus: this.daemonicFaeryInstance.getFaeryStatus(),
                    webSignals: this.variables.listeners
                })),
                isHTML: this.variables.pageHTML=="[INJECTJSON]"?false:true
            });
        }
    }
}