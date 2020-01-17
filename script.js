'use strict';

const shell = require('electron').shell
const sql = require('mssql')
//const vue = require('vue')
let fs = require('fs-extra')
let htmlPdf = require('html-pdf')
let ezPdfMerge = require('easy-pdf-merge')
let busy = 0

let config = JSON.parse(fs.readFileSync( "I:\\Parts\\FMH\\FMH102\\FMH10223\\config\\config.json", "utf8"))
let database = JSON.parse(fs.readFileSync( "I:\\Parts\\FMH\\FMH102\\FMH10223\\config\\database.json", "utf8"))
let username = logUsername()


let Part = function (){
    this.id='000'
    this.partNumber=''
    this.description=''
    this.scheme=''
    this.type=''
    this.rev=''
    this.status = ''
    this.redlineRev=0
    this.packRev=0
    this.changed=false
    this.bom = []
    this.bomParts = []
    this.certs = []
    this.owner = ''
    this.notes = ''
    this.isRevControlled = false
    this.resolvedBom = []
    this.deepBom=[]
    this.deepBomParts = []

    this.file =  {
        redline:{
            exists: false,
            location: ''
        },
        pack: {
            exists: false,
            location: ''
        },
        core:{
            exists: false,
            location: ''
        },
        index: {
            exists: false,
            location: ''
        },
        folder: {
            exists: false,
            location: ''
        },
        rootDir: {
            exists: false,
            location: config.rootDir
        },
        seeIfExists: (callback)=>{
            
            this.file.getPaths()
            //1
            fs.exists(this.file.core.location,(exists)=>{
                this.file.core.exists = exists
                responseRecived()
            })
            //2
            fs.exists(this.file.redline.location,(exists)=>{
                this.file.redline.exists = exists
                responseRecived()
            })
            //3
            fs.exists(this.file.pack.location,(exists)=>{
                this.file.pack.exists = exists
                responseRecived()
            })
            //4
            fs.exists(this.file.index.location,(exists)=>{
                this.file.index.exists = exists
                responseRecived()
            })
            //5
            fs.exists(this.file.folder.location,(exists)=>{
                this.file.folder.exists = exists
                responseRecived()
            })
            //6
            fs.exists(this.file.rootDir.location,(exists)=>{
                this.file.rootDir.exists = exists
                responseRecived()
            })

            //** Count 6 responses before firing callback */
            let responsesRecived = 0
            function responseRecived(){
                responsesRecived =  responsesRecived+1
                if(responsesRecived==6){
                    console.log('all file exists res recived')
                   if(callback){callback()}
                }
            }
        
        },
        getPaths:()=>{
            let revExt = ' REV '+this.rev
            if(!this.rev){
                revExt = ''
            }

            if(this.scheme=='FMH'){
                this.file.folder.location = config.rootDir+this.scheme+"\\"+this.partNumber.substring(0, 6)+"\\"+this.partNumber
                this.file.core.location = this.file.folder.location+"\\REV "+this.rev+"\\"+this.partNumber+revExt+".pdf"
            }else{
                this.file.folder.location = config.rootDir+this.scheme+"\\"+this.partNumber
                this.file.core.location = this.file.folder.location+"\\"+this.partNumber+revExt+".pdf"
            }
           
            this.file.redline.location = this.file.folder.location+"\\"+"Redlines"+"\\"+this.partNumber+revExt+" RL"+this.redlineRev+".pdf"
            this.file.pack.location = this.file.folder.location+"\\"+"Production Packages"+"\\"+"PK"+this.packRev+"\\"+this.partNumber+revExt+" PK"+this.packRev+".pdf"
            this.file.index.location = this.file.folder.location+"\\"+"Production Packages"+"\\"+"PK"+this.packRev+"\\"+this.partNumber+revExt+" PK"+this.packRev+" INDEX.pdf"
            
        }
    }
    this.getPart=(callback)=>{
      
        
        
        let query = "SELECT * FROM  partMaster WHERE id= '"+this.id+"' "
        if(this.id=='000'){query = "SELECT * FROM  partMaster WHERE partNumber= '"+this.partNumber+"' AND scheme='"+this.scheme+"' "}
        runSql(query,(err,res)=>{
           
                let record = res.recordset[0]
    
                if(res.recordset.length==1){
                    this.id = record.id
                    this.partNumber= removeWhiteSpace(record.partNumber)
                    this.scheme=   record.scheme.trim()
                    this.description= record.description.trim()
                    this.rev=  removeWhiteSpace(record.coreRev)
                    this.redlineRev= record.redlineRev
                    this.type= removeWhiteSpace(record.type)
                    this.packRev=record.packRev
                    this.status = removeWhiteSpace(record.status)
                    this.file.getPaths()     
                    this.file.seeIfExists()
                    this.getCerts(()=>{})
                    this.owner = removeWhiteSpace(record.owner)
                    this.notes = record.notes
                    this.isRevControlled = record.isRevControlled
                }
                if(callback){callback()}
    
        })  
        
    }
    this.bomChanged=()=>{
        let partMaster=this.bomParts
        let bom = this.bom
        
        for(let i=0; i<bom.length && !this.changed; i++){ 
            
            if( (partMaster[i].type=='ASSY'||partMaster[i].type=='SUB')&& partMaster[i].id!==this.id ){
                
                partMaster[i].getBom(()=>{
                    partMaster[i].bomChanged()
                    if(partMaster[i].changed){this.changed=true}
                })
                    
            }
            if(bom[i].rev!==partMaster[i].rev||bom[i].redlineRev!==partMaster[i].redlineRev||partMaster[i].packRev!==bom[i].packRev||partMaster[i].changed){
                this.changed=true
            }
                
        }
    
    }
    this.getBom=(callback)=>{
        
        
            let query = "SELECT * FROM  boms left join partMaster on boms.partId=partMaster.id WHERE  (bomId='"+this.id+"') ORDER BY case when item is null then 1 else 0 end, item"
            runSql(query,(err,res)=>{
                let recordSet = []
                if(res){recordSet = res.recordset}
    
                let bom = []
                let part = []
                for(let i=0;i<recordSet.length;i++){
                    let res = recordSet [i]
    
                   
    
    
                    bom[i] = new BomItem()
                    bom[i].id = res.id[0]
                    bom[i].item= removeWhiteSpace(res.item)
                    bom[i].partId= res.partId
                    bom[i].qty= res.qty
                    bom[i].rev= removeWhiteSpace(res.coreRev[0])
                    bom[i].redlineRev= res.redlineRev[0]
                    bom[i].packRev= res.packRev[0]
                    bom[i].coreIncluded= res.coreIncluded
                    bom[i].rlIncluded= res.rlIncluded
                    bom[i].packIncluded= res.packIncluded
                    
                    
                 
                    part[i] = new Part()
                    part[i].id = res.id[1]
                    part[i].partNumber= removeWhiteSpace(res.partNumber)
                    part[i].scheme=removeWhiteSpace(res.scheme)
                    part[i].description = res.description
                    if(part[i].description){part[i].description = part[i].description.trim()}
                    part[i].rev = removeWhiteSpace(res.coreRev[1])
                    part[i].redlineRev=res.redlineRev[1]
                    part[i].type = removeWhiteSpace(res.type)
                    part[i].packRev = res.packRev[1]
                    part[i].status = res.status
                    if(part[i].status){part[i].status = part[i].status.trim()}
                    part[i].file.getPaths()
                 
    
                }
                this.bomParts = part
                this.bom = bom
               
                if(callback){callback()}
            })
      
    
    }
    this.seeIfBomFilesExists = (callback)=>{
        for(let i=0;i<this.bomParts.length;i++){
            this.bomParts[i].file.seeIfExists()
        }
    }
    this.addToBom=(bomItem,part,callback)=>{
        console.log('add to bom')
        if(!part.coreRev){part.coreRev=''}
    
        /*Append Array for Imidiate Display on the screen  */
        let bomItemLocation =   this.bom.length
        this.bom[bomItemLocation]=bomItem
        this.bomParts[bomItemLocation]=part
    
        /* Add to SQL */
        let query = "INSERT INTO boms (bomId,partId,item,coreRev) OUTPUT Inserted.ID "
        query = query + " VALUES ('"+this.id+"','"+bomItem.partId+"','"+bomItem.item+"','"+part.coreRev+"')"
        runSql(query,(err,res)=>{
            if(err){throw err}
            this.bom[bomItemLocation].id=res.recordset[0].ID
            this.bomParts[bomItemLocation].file.seeIfExists()
            if(callback){callback()}
        })
    
    }
    this.deleteFromBom=(id)=>{
        for(let i=0; activeBom.bom.length>i; i++){
            if(id==activeBom.bom[i].id){
                activeBom.bom.splice(i,1)
                activeBom.bomParts.splice(i,1)
            }
        }
    
        let query ="Delete from boms WHERE id='"+id+"';"
        runSql(query,(err,res)=>{
            if(err){console.log(err)}else{console.log('Deleted')}
        }) 
    }
    this.makeIndexSheet = (callback)=>{
        this.file.getPaths()
        removeFile(this.file.index.location,()=>{})
    
    
        let makeHtmlIndexSheet = ()=>{
            let bom = this.bom
            let partMaster = this.bomParts
    
            let rows = ""
            for(let i=0;i<bom.length;i++){
        
        
            /* Define Change Flag*/
            let changeFlag=''
            if(bom[i].rev!==partMaster[i].rev||bom[i].redlineRev!==partMaster[i].redlineRev){
                changeFlag = 'CHANGED'
            }
        
        
            let coreIncluded=''
            if(bom[i].coreIncluded){coreIncluded='X'}
            let rlIncluded=''
            if(bom[i].rlIncluded){rlIncluded='X'}
            let packIncluded=''
            if(bom[i].packIncluded){packIncluded='X'}
           
            let row = ""
            /*Item*/            row=row+"<td>"+bom[i].item+"</td>"
            /*Part Number*/     row=row+"<td>"+partMaster[i].partNumber+"</td>"
            /*Description*/     row=row+"<td>"+partMaster[i].description+"</td>"
            /*Quantity*/        row=row+"<td>"+bom[i].qty+"</td>"
            /*Changed Flag*/    row=row+"<td class='changed'>"+changeFlag+"</td>"
            /*Core Rev*/        row=row+"<td>"+bom[i].rev+"</td>"
            /*Core Included*/   row=row+"<td>"+coreIncluded+"</td>"
            /*Redline Included*/row=row+"<td>"+rlIncluded+"</td>"
            /*Pack Included*/   row=row+"<td>"+packIncluded+"</td>"
          
           
            
            /*Compile Rows*/
            rows=rows+"<tr style='height=1in;' >"+row+"</tr>"
            }
        
            
           let footer=""
          let pages = Math.ceil((bom.length+2)/30)
           for(let i=1;i<pages+1;i++){
            
               footer=footer+"<div style = 'font-family:\"Helvetica\";'  id='pageFooter-"+i+"'>Page "+i+" of "+pages+"</div>"
           }
           
    
        
            let tableStyle ="width:100%;"+
         
            "text-align: center;"+
            "font-size: .25in;"+
            "border-style: solid;"+
            "font-family:\"Helvetica\";"
            let titleStyle ="width:100%;"+
            "text-align: center;"+
            "font-size: .25in;"+
            "background-color: #c1c1c1;"+
            "font-family:\"Helvetica\";"
           
            let heading="<th style = 'font-size: .25in;' >Item</th>  <th>Part</th> <th>Description</th> <th>Qty</th>  <th></th> <th>Rev</th> <th></th>  <th>RL</th> <th>PK</th> "
            let title="<div style='"+titleStyle+"'>"+this.scheme+" "+this.partNumber+" REV "+this.rev+"-"+this.packRev+" "+this.description+"</div>"
            let table="<table style='"+tableStyle+"'><thead>"+heading+"</thead><tbody>"+rows+"</tbody></table>"
        
            return title+table+footer
        }
    
        let htmlIndexSheet = makeHtmlIndexSheet()
      
        htmlToPdf(htmlIndexSheet,this.file.index.location,callback)
        function removeFile(path,callback){
            fs.remove(path,(err)=>{
                if(err){console.log(err)}
                callback()
            })
        }
       
        function htmlToPdf(html,path,callback){
            console.log('make index sheet at '+path)
            let options = {height: "11in", width: "17in", border: ".5in"}
            htmlPdf.create(html,options).toFile(path,(err,res)=>{
                if(err){console.log(err)}
                console.log('PDF Index Sheet Made and put at ', res.filename)
                callback()
            })
        }
    }
    this.getCerts = (callback)=>{
        let query = 
        "SELECT partCertifications.id, certifications.certification from partCertifications inner join certifications on certifications.id = partCertifications.certificationId"+
        " where partCertifications.partId = '" + this.id +"'"
        runSql(query,(err,res)=>{
            if(err){throw err}
            this.certs = res.recordset
            callback()
        })
    }
    this.deleteCert = (id)=>{
        let query = " delete from partCertifications where id = " + id
        runSql(query,(err,res)=>{
            if(err){throw err}
        })
    }
    this.getPartId = (callback)=>{
        let query = "select id from partMaster where partNumber = '"+this.partNumber+"' and scheme = '"+this.scheme+"'"
        runSql(query,(err,res)=>{
    
            if(res.recordset.length>0){
                this.id = res.recordset[0].id
                this.getPart(callback)
            }
            else{
                console.log('part does not exist in DB')
            }
           
        })
    }
    this.savePart=(callback)=>{
        let newPart =(callback)=>{
            let query = "insert into partMaster (partNumber,scheme,type,coreRev,packRev,status,owner,isRevControlled,description)"+
            " VALUES('"+this.partNumber+"','"+this.scheme+"','"+this.type+"','"+this.rev+"','"+this.packRev+"','"+this.status+"','"+username+"','"+this.isRevControlled+"','"+this.description+"'); SELECT @@IDENTITY AS 'Identity'; "
            
            this.file.seeIfExists(()=>{
                if(!this.file.folder.exists){fs.mkdir(this.file.folder.location,()=>{})}
            })
    
            runSql(query,(err,res)=>{
                this.id= res.recordset[0].Identity
                console.log('added id:'+this.id)
                this.getPart(()=>{
                    
                    callback()
                })
                
                
            })
        
        }
        let updatePart = (callback)=>{
            let queryValues = " "+
            "   partNumber='"           +this.partNumber            +"' "+
            " , description='"          +this.description           +"' "+
            " , type='"                 +this.type                  +"' "+
            " , coreRev='"              +this.rev                   +"' "+
            " , redlineRev='"           +this.redlineRev            +"' "+
            " , packRev='"              +this.packRev               +"' "+
            " , status='"               +this.status                +"' "+
            " , owner='"                +this.owner                 +"' "+
            " , notes='"                +this.notes                 +"' "+
            " , isRevControlled='"      +this.isRevControlled       +"' "+
            " "
    
            let query = " UPDATE partMaster SET "+queryValues+"  WHERE id= '"+this.id + "'"
            
    
            
            fs.mkdirs(this.file.folder.location,()=>{})
            
    
            if(this.partNumber!=='' || this.scheme==''){runSql(query,(err,res)=>{callback()})}
            else{console.log('Error: can not save a blank part number or scope')}
        }

        this.partExists((partExists)=>{
            if(partExists==0){
                newPart(()=>{
                    console.log('Part Created')
                    if(callback){callback()}
                })
            }
            else{
                updatePart(()=>{
                    console.log('Part Updated')
                    if(callback){callback()}
                })
            }
        })
        
        
    }
    this.delete=(callback)=>{
        let query = " DELETE FROM partMaster WHERE id = '"+this.id+"' "
        runSql(query,()=>{
            this.reset()
            callback()
        })
    }
    this.reset=()=>{
        this.id='000'
        this.partNumber=''
        this.description=''
        this.scheme=''
        this.type=''
        this.rev=''
        this.status = ''
        this.redlineRev=0
        this.packRev=0
        this.changed=false
        this.bom = []
        this.bomParts = []
        this.certs = []
        this.owner = ''
        this.notes = ''
    }
    this.makeProductionFolder= ()=>{
        console.log('make folder')
        for(let i=0; this.bomParts.length>i;i++){
            let source = this.bomParts[i].file.core.location
            let dest = this.file.folder.location +"\\Production Packages\\PK" +this.packRev+"\\"+ this.bomParts[i].partNumber +" REV "+this.bomParts[i].rev+ ".pdf "
            fs.copy(source,dest,(err)=>{
                if(err){console.log(err)}
                else{console.log(this.bomParts[i].file.core.location, 'copied')}
            })
        }
    }
    this.partExists = (callback)=>{
        let query = "SELECT * FROM  partMaster WHERE partNumber= '"+this.partNumber+"' AND scheme = '"+this.scheme+"'"
        runSql(query,(err,res)=>{
                //will return 1 if part exists in the database, otherwise 0
                if(callback){callback(res.recordset.length)}
        })
    
    }
    this.makePdf = (callback) =>{
            /* In order to display a progress bar */
            let progressBar = document.getElementById('buildPackProgressBar')
            progressBar.style.width='5%'
            progressBar.style.display='block'
    
            /*Rev the pack */
            edit(this.id,'packRev','partMaster',this.packRev+1,()=>{})
            this.packRev = this.packRev+1
           
            this.getBom(()=>{
                    progressBar.style.width='30%'
                    activeBom.seeIfBomFilesExists()
                    
                    let pdfFiles = this.getProductionPackage()
                    let pdfDestPath = this.file.pack.location
                    progressBar.style.width = '60%'
                        
                    this.makeIndexSheet(()=>{
                        progressBar.style.width = '80%'
                        ezPdfMerge(pdfFiles,pdfDestPath,(err)=>{
                                    if(err){
                                        progressBar.style.background='RED'
                                        console.log(err)
                                        setTimeout(()=>{
                                            progressBar.style.display='none'
                                            progressBar.style.background='#17c11a'
                                        },2000)
                                    }
                                    else{
                                        console.log('pdf made and put at ')
                                        console.log(pdfDestPath)
                                        callback()
                                        progressBar.style.width = '100%'
                                        slideOutPart.getPart(()=>{progressBar.style.display='none'})
                                    }
                        })
                            
                    })
            })
    }
    this.getProductionPackage = ()=>{
            let bom  = this.bom
            let bomPart = this.bomParts
    
            let pdfFiles=[]
    
            /*Pull in main drawing and index */
            let pdfFilesLength=2
            this.file.getPaths()
            this.file.seeIfExists()
    
            pdfFiles[0] = this.file.index.location
            if(this.file.core.exists){pdfFiles[1] = this.file.core.location}
            else{pdfFilesLength=1}
        
                    for (let i=0;i<bom.length; i++){
                     
                        bomPart[i].file.getPaths()
                      
                        /*Production Package */ let pdfProdPath = bomPart[i].file.pack.location
                        /*Standard Drawing  */	let pdfStdPath = bomPart[i].file.core.location
                        /*Redline Drawing  */	let pdfRedlinePath = bomPart[i].file.redline.location
                       
                        if (bom[i].packIncluded){
                            console.log('file found')
                            pdfFiles[pdfFilesLength] = pdfProdPath
                            pdfFilesLength++
                        }
                        if(bom[i].coreIncluded){
                            console.log('file found')
                            pdfFiles[pdfFilesLength] = pdfStdPath
                            pdfFilesLength++
                        }
                        if(bom[i].rlIncluded){
                            console.log('file found')
                            pdfFiles[pdfFilesLength] = pdfRedlinePath
                            pdfFilesLength++
                        }
                    }
                    console.log('pdf files',pdfFiles)
                    return pdfFiles
        
    
    }
    this.revRedline = (callback)=>{
    
        this.redlineRev = this.redlineRev+1
        this.file.getPaths()
    
        let partSaved
        let folderExists
        this.savePart(()=>{
            partSaved=true
            if(callback && folderExists){callback()}
        }) 
        fs.mkdirs(this.file.folder.location+"\\Redlines",()=>{
            folderExists=true
            if(callback && partSaved){callback()}
        }) 
    
    }
    this.resolveBom=()=>{
        for(let i=0;i<this.bom.length;i++){
            this.resolvedBom[i]={}
            this.resolvedBom[i].item= this.bom[i].item
            this.resolvedBom[i].partNumber= this.bomParts[i].partNumber
            this.resolvedBom[i].rev= this.bom[i].rev
            this.resolvedBom[i].description= this.bomParts[i].description
            this.resolvedBom[i].qty= this.bom[i].qty
            this.resolvedBom[i].scope= this.bomParts[i].scheme
    
        }
    }
    this.exportBom = ()=>{
        this.resolveBom()
        let csv = toCSV(this.resolvedBom)
        fs.writeFile(this.file.folder.location+"\\csv.csv",csv)
    }
    this.saveBom = (callback)=>{
        let query = 'DELETE FROM BOMS WHERE bomId = '+this.id+" ;"
        query = query+ "INSERT INTO BOMS (bomId,partId,item,qty,coreIncluded,redlineIncluded,packIncluded,coreRev,redlineRev,packRev)"
        query = query +" VALUES "
    
        for(let i=0;i<this.bom.length;i++){
           
    
          
            let rlIncluded = this.bom[i].rlIncluded
            if (rlIncluded == '' || !rlIncluded){rlIncluded = null}
    
            query = query + " ( "
            query = query + this.id + " , "
            query = query + this.bomParts[i].id + " , '"
            query = query + this.bom[i].item + "' , "
            query = query + this.bom[i].qty + " , "
            query = query + this.bom[i].coreIncluded + " , "
            query = query + rlIncluded + " , "
            query = query + this.bom[i].packIncluded + " , '"
            query = query + this.bom[i].rev + "' , "
            query = query + this.bom[i].redlineRev + " , "
            query = query + this.bom[i].packRev + " ) "
    
            if(i!==this.bom.length-1){query = query + " ,\n "}
        }
        runSql(query,(err,res)=>{
            if(callback){callback(err,res)}
        })
        console.log(query)
    }
    this.whereUsed = (callback)=>{
        let query = "SELECT * from boms where partId= "+ this.id
        runSql(query,(err,res)=>{
            
            //console.log(res)
            let parts = []
            for(let i=0;i<res.recordset.length;i++){
                let record = res.recordset[0]
                parts[i] = new Part
                parts[i].id = record.bomId
                parts[i].getPart(()=>{
                    console.log(parts[i])
                })
           
            }
           
        })
    }
    this.makeDeepBom = ()=>{
        this.deepBom = this.bom
        this.deepBomParts = this.bomParts
        for(let i=0;i<this.bomParts.length;i++){
            this.deepBom.push(this.bomParts[i].bom) 
            this.deepBomParts.push(this.bomParts[i].bomParts) 
            this.bomParts[i].getBom(()=>{
                this.bomParts[i].makeDeepBom()
            })
        }
    
    }
   
}
let PartList = function (){
    this.list = []
    this.checkForChange = true
    this.parameters = new Part()
  
    this.getPartList = function (callback){
        let partSearch = this.parameters
        let query = "SELECT TOP 500 * FROM  partMaster WHERE "
        if(partSearch.partNumber!=='' ){query = query + " partNumber like '"+partSearch.partNumber+"%' AND "}
        if(partSearch.description!==''){query = query + " description like '"+partSearch.description+"%' AND "}
        if(partSearch.type!==''){query = query + " type = '"+partSearch.type + "' AND "}
        if(partSearch.status!==''){query = query + " status like '"+partSearch.status + "%' AND "}
        if(partSearch.scheme!==''){query = query + " scheme like '"+partSearch.scheme + "%' AND "}
        query = query + " 1=1 "
        query = query + " ORDER BY partNumber "

        runSql(query,(err,res)=>{
           

            let length = res.recordset.length
           
            this.list=[]
            for(let i=0;i<length;i++){
                let record = res.recordset[i]
                this.list[i] = new Part()
                this.list[i].id = record.id
                this.list[i].partNumber=removeWhiteSpace(record.partNumber)
                this.list[i].description=record.description.trim()
                this.list[i].scheme=removeWhiteSpace(record.scheme)
                this.list[i].type=removeWhiteSpace(record.type)
                this.list[i].rev = removeWhiteSpace(record.coreRev)
                this.list[i].packRev = record.packRev
                this.list[i].redlineRev = record.redlineRev
                if(record.status){this.list[i].status = removeWhiteSpace(record.status)}

                if(this.list[i].type=='ASSY' && this.checkForChange==true ||this.list[i].type=='SUB' && this.checkForChange==true){
                    this.list[i].getBom(  this.list[i].bomChanged )
                }

            }
            
            
          
         
          
            if(callback){callback()}
           
        })

    }
   
}
let BomItem = function(){
    this.id=''
    this.item//= ''
    this.partId = ''
    this.qty=0
    this.rev=''
    this.redlineRev=0
    this.packRev=0
    this.coreIncluded=false
    this.rlIncluded=false
    this.packIncluded=false
}
let Scheme = function(){
    this.schemes = []
    this.getSchemes = (callback)=>{
        let query = 'SELECT * FROM schemes ORDER BY displayAs '
        runSql(query,(err,res)=>{
        
            this.schemes = res.recordset

            for(let i=0;i<this.schemes.length;i++){
              
                this.schemes[i].scheme =this.schemes[i].scheme.trim()
                this.schemes[i].displayAs =this.schemes[i].displayAs.trim()
            }
            if(callback){callback()}
            
        })
    }
    this.getSchemes(()=>{})
    this.newScheme = (scheme,displayAs,callback)=>{
       let query = "INSERT INTO schemes (scheme, displayAs) VALUES ( '" + scheme + "' , '"+displayAs + "' )" 
       console.log('scheme query ',query)
       runSql(query,(err,res)=>{
            console.log(err)
            console.log(res)
            fs.ensureDir(config.rootDir+scheme,()=>{callback()})
           
       })
      
    }
    this.deleteScheme = (id,callback)=>{
        let query = "DELETE FROM schemes WHERE "+id +" = id"
        runSql(query,()=>{
            if(callback){callback()}
        })
    }
}
let Certification = function(){
    this.certifications = []

    
    this.getCertifications = () => {
        let query = 'SELECT * FROM certifications'
        runSql(query,(err,res)=>{
            if(err){throw err}
            this.certifications = res.recordset
            for(let i=0;i<res.recordset.length;i++){
                this.certifications[i].name = res.recordset[i].certification.trim()
                this.certifications[i].id = res.recordset[i].id
            }
   
        })
    }
    this.getCertifications()
    this.addCertToPart=()=>{
        let query = "INSERT INTO partCertifications (partId,certificationId)"+
        "  VALUES ('"+slideOutPart.id+"','"+certificationSelect.value +"');"

        runSql(query,(err,res)=>{if(err){throw err}})
    }

}
let Ace = function (){
   
    this.copyTemplateFiles = (callback)=>{
        fs.copyFile(config.aceTemplateFolder+'FMHxxxxx.WDP',this.projectLocation+'\\'+slideOutPart.partNumber+".WDP")
        fs.copyFile(config.aceTemplateFolder+'FMHxxxxx.WDT',this.projectLocation+'\\'+slideOutPart.partNumber+".WDT")
        fs.copyFile(config.aceTemplateFolder+'FMHxxxxx_WDTITLE.WDL',this.projectLocation+'\\'+slideOutPart.partNumber+"_WDTITLE.WDL")
        fs.copyFile(config.aceTemplateFolder+'FMHxxxxx-BOM.xlsx',this.projectLocation+'\\'+slideOutPart.partNumber+"-BOM.xlsx")
        fs.copyFile(config.aceTemplateFolder+'FMHxxxxx-01.dwg',this.projectLocation+'\\'+slideOutPart.partNumber+"-01.dwg")
        callback()
    }
    this.buildWdp=(callback)=>{
        fs.readFile(this.projectLocation+'\\'+slideOutPart.partNumber+".WDP",(err,res)=>{
            res = res.toString('utf8')
            if(err){throw err}
           
            let wdp =   '*[1]' + slideOutPart.partNumber + '\n' +
                        "*[2]" +slideOutPart.description + '\n' +
                        "*[4]" +slideOutPart.rev + '\n' + '?' +
                        res + '\n' +
                        slideOutPart.partNumber+"-01.dwg" 
      
            fs.writeFile(this.projectLocation+'\\'+slideOutPart.partNumber+".WDP",wdp,()=>{
                if(callback){callback()}
            })
            
            
         
        })
    }
    this.makeProject=(callback)=>{
        this.projectLocation = slideOutPart.file.folder.location +"\\"+"Working Copy\\"+slideOutPart.partNumber +" ACE"
        fs.mkdirs(this.projectLocation,()=>{
            this.copyTemplateFiles(()=>{
                this.buildWdp(()=>{
                    if(callback){callback()}
                })

            })
        })
        
    }
}
let panes = {
    get bomOpen(){
        return document.getElementById('bomTable').style.display =='grid'
    }
}


function logUsername(){
    const username = require('username');
    let user = username.sync()
    const userLog = require('simple-node-logger').createSimpleLogger({
            logFilePath:'I:\\Parts\\FMH\\FMH102\\FMH10223\\logs\\logIns.log',
            timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
        })
    userLog.info(user)
    return user
}
const filesViewdLog = require('simple-node-logger').createSimpleLogger({
    logFilePath:'I:\\Parts\\FMH\\FMH102\\FMH10223\\logs\\filesViewd.log',
    timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
})
const autoNumberLog = require('simple-node-logger').createSimpleLogger({
    logFilePath:'I:\\Parts\\FMH\\FMH102\\FMH10223\\logs\\autoNumber.log',
    timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
})

let schemes = new Scheme()
let partList = new PartList()
let activeBom = new Part()
let activeBomIdHistory = []
let slideOutPart = new Part ()
let certifications = new Certification ()
let ace = new Ace()

let angularModule = angular.module('angularModule',[])
angularModule.controller('angularController',($scope)=>{

        /* General */
        $scope.reload = function(){
            $scope.$apply(()=>{
                $scope.schemes = schemes.schemes
                $scope.slideOutPart = slideOutPart
                $scope.bomOpen = document.getElementById('bomTable').style.display =='grid'
                $scope.activeBom = activeBom
                $scope.certifications = certifications.certifications
                $scope.config = config
                $scope.database = database
                $scope.activeBomIdHistory = activeBomIdHistory
               
          
            })
        }
        setInterval(()=>{
            $scope.reload()  
        },500)
        $scope.activeBom = activeBom
        $scope.slideOutPart = slideOutPart

        
       
    
        /*Handles a file drop*/
        let divDropZone = document.getElementById('dropZone')
        divDropZone.ondragover = () => { event.preventDefault() }
        divDropZone.ondrop = (event) => {
                

                divDropZone.style.background = '#17c11a'
                
                /*Get the first file dropped. Ignore all others*/
                let file = event.dataTransfer.files[0]

                
                /*Error checking*/
                let err = false
                if(event.dataTransfer.files.length>1)   {err = 'Only 1 PDF can be attached'}
                if(event.dataTransfer.files.length<1)   {err = 'First copy the PDF to your desktop'}
                if(!err){
                    if(file.type!=='application/pdf')   {err = 'Document must be a PDF'}
                }
               
               
                

                /* If there is an error do not move on */
                if (err){
                    document.getElementById('footer').innerHTML = err
                    divDropZone.style.background = '#506e91' 
                }
                else {
                      /* Define Drawing Paths */ 
                      let drawingType = document.getElementById('dropDrawingType').value
                      let destinationPath = ''
                      if (drawingType=='core'){
                          destinationPath = slideOutPart.file.core.location
                          console.log('dest path', destinationPath)
                          
                          if(slideOutPart.scheme=='FMH'){fs.mkdirs(slideOutPart.file.folder.location+"\\REV "+slideOutPart.rev,()=>{})}
                      }
                      if (drawingType=='redline'){
                            slideOutPart.revRedline()      
                            destinationPath = slideOutPart.file.redline.location
                            console.log(destinationPath)
                      }
  
                      /* Read File*/
                      let pdfFile = fs.readFileSync(file.path)
  
                      /* Write File*/ 
                      fs.exists(destinationPath,(fileExists)=>{
                          let writeDrawing = false
                          if(fileExists){
                              writeDrawing = confirm("This drawing already exists, would you like to overwrite it?");
                          }
                          else{
                              writeDrawing = true
                          }
  
                          if(writeDrawing){
                              fs.writeFile(destinationPath,pdfFile,'UTF8',(err)=>{
                                  if(err){
                                      document.getElementById('footer').innerHTML = 'Error Adding File'
                                      console.log('Error Adding File',err)
                                  }
                                  else{
                                      document.getElementById('footer').innerHTML = ''
                                      slideOutPart.file.seeIfExists()
                                  }
                                  
                              })
                          }             
                        
  
                          divDropZone.style.background = '#506e91'
                      })
  
                     
  
                      
                     
                }
            

        }


        
        $scope.rowOnClick = function(part){
         
            slideOutPart = part
            slideOutPart.file.seeIfExists(()=>{
                if(!slideOutPart.file.folder.exists)fs.mkdirs(slideOutPart.file.folder.location,()=>{
                    slideOutPart.file.seeIfExists(()=>{})
                })
            })
            
            slideOutPart.getPart(()=>{})
            slideOut()
            document.getElementById('footer').innerHTML =''
            document.getElementById('buildPackButton').style.background='#555'
        
            
        }
        /* Part Table */
        $scope.searchButtonOnClick = function(){
        
          let partSearch = new Part()
          partSearch.partNumber=document.getElementById('partNumberSearch').value
          partSearch.description=document.getElementById('descriptionSearch').value
          partSearch.type=document.getElementById('typeSearch').value
          partSearch.scheme=document.getElementById('schemeSearch').value
          partSearch.status=document.getElementById('statusSearch').value
          partList.getPartList(partSearch,()=>{
                  $scope.$apply(()=>{$scope.partList=partList.list})
          })
        }
        $scope.addToBomButtonOnClick=function(part){
            let bomItem = new BomItem()
            bomItem.partId = part.id

            /* Select Bom Find Number */
            if(activeBom.bom.length==0){
                bomItem.item = "001"
            }else{
                bomItem.item = Number(activeBom.bom[activeBom.bom.length-1].item)
                bomItem.item++
                bomItem.item = bomItem.item.toString()
                if(bomItem.item.length==0){bomItem.item = "000"+bomItem.item}
                if(bomItem.item.length==1){bomItem.item = "00"+bomItem.item}
                if(bomItem.item.length==2){bomItem.item = "0"+bomItem.item}
            }
            
            
            activeBom.addToBom(bomItem,part,()=>{
                let bomTableBody = document.getElementById('bomTableBody')
                bomTableBody.scrollTop = bomTableBody.scrollHeight
            })
        }

        /* Part Slide Out Bar*/
        $scope.slideOutDeleteOnClick=function(){
            let deletePart = confirm('Are you sure you want to delete this part?')
            if(deletePart){slideOutPart.delete(()=>{})}
        }
        $scope.slideOutSaveOnClick = function(){
            slideOutPart.savePart(slideOutPart.getPart)         
        }
        $scope.slideOutAutoNumberOnClick = function slideOutAutoNumberOnClick(){
      
            autoNumber(()=>{
                slideOutPart.partNumber = config.autoNumber
                slideOutPart.scheme='FMH'
                slideOutPart.type='ASSY'
                slideOutPart.rev='1'
                slideOutPart.status=''
                
                slideOutPart.file.seeIfExists(()=>{
                    if(slideOutPart.file.folder.exists==true){
                        slideOutAutoNumberOnClick()
                        
                    }else{
                        slideOutPart.savePart(()=>{
                            ace.makeProject(()=>{
                                slideOutPart.getPartId(slideOutPart.getPart)
                            })
                        })
                        
                    }
                })
                    
                
                
            })

        }
        $scope.slideOutNotesButtonOnClick = function(){
           document.getElementById('promptBox').style.display='grid'
        }
        $scope.slideOutNewOnClick = function(){
            slideOutPart = new Part()
        }
        $scope.partNumberOnChange = function(){
            slideOutPart.partExists((exists)=>{
                console.log('part exists ',exists)
                if(exists){
                    console.log('get part')
                    slideOutPart.getPart()
                }

            })
        }
        $scope.isRevControlledOnChange = function(){
            slideOutPart.rev = ''
            slideOutPart.savePart(slideOutPart.getPart)  
        }

                /* Window Navigation */
        $scope.closeBomTableButtonOnClick = function(){

            let partTable = document.getElementById('partTable')
            let bomTable = document.getElementById('bomTable')
            bomTable.style.display='none'
            partTable.style.gridRowStart ='M1'
            activeBomIdHistory = []
            vmSearch.$forceUpdate()
      
        }
        $scope.closeSideBarButtonOnClick = function(){
            let partSlideOutBar =  document.getElementById('partSlideOutBar')
            partSlideOutBar.style.display='none'

            let partTable=document.getElementById('partTable')
            partTable.style.gridColumnEnd = 'R'

            let bomTable = document.getElementById('bomTable')
            bomTable.style.gridColumnEnd = 'R'

            let settingsPane = document.getElementById('settingsPane')
            settingsPane.style.display='none'
        }
        $scope.closePromptBox = function(){
            document.getElementById('promptBox').style.display='none'
            slideOutPart.savePart()
        }
        $scope.openBomButtonOnClick=function(){
            activeBom.id = Object.assign(slideOutPart.id)
       
            activeBom.getBom(()=>{
                activeBom.file.seeIfExists()
                activeBom.seeIfBomFilesExists()
                activeBomIdHistory[activeBomIdHistory.length] = activeBom.id
                activeBom.exportBom()
                $scope.reload()
            })
            activeBom.getPart(()=>{})

            let partTable = document.getElementById('partTable')
            let bomTable = document.getElementById('bomTable')
            let bomTableBody = document.getElementById('bomTableBody')
            bomTable.style.display='grid'
            partTable.style.gridRowStart ='M2'
            bomTableBody.scrollTop = 0
            vmSearch.$forceUpdate()
          
        }
        $scope.activeBomBack = function(){
            console.log('active bom',activeBom.id)
            activeBom.id = activeBomIdHistory[activeBomIdHistory.length-2]
            console.log('get bom', activeBom.id)
            activeBom.getPart(()=>{

            })
            activeBom.getBom(()=>{
                activeBom.file.seeIfExists()
                activeBom.seeIfBomFilesExists()
                activeBomIdHistory.length = activeBomIdHistory.length-1
                $scope.reload()
            })

        }
        $scope.partMasterButtonOnClick = function(){
            slideOutPart.reset()
            slideOut()
        }

        /* Certifications */
        $scope.addCertOnClick = function(){
            console.log('add cert')
            certifications.addCertToPart()
            slideOutPart.getCerts(slideOutPart.getPart)
        }
        $scope.deleteCertOnClick = function (id){
            console.log('delete ',id)
            slideOutPart.deleteCert(id)
            slideOutPart.getCerts(slideOutPart.getPart)
        }

        /* Drawing / Folder Buttons */
        $scope.openCore = function(){
            shell.openItem(slideOutPart.file.core.location)
            filesViewdLog.info(username +' '+slideOutPart.partNumber + ' REV ' +slideOutPart.rev)
        }
        $scope.openRedline = function(){
            shell.openItem(slideOutPart.file.redline.location)
            filesViewdLog.info(username +' '+slideOutPart.partNumber + ' REV ' +slideOutPart.rev +' RL'+slideOutPart.redlineRev) 
        }
        $scope.openPack = function(){
            shell.openItem(slideOutPart.file.pack.location)
            filesViewdLog.info(username +' '+slideOutPart.partNumber + ' REV ' +slideOutPart.rev +' PK'+slideOutPart.packRev) 
        }
        $scope.openFolder = function (){
            shell.openItem(slideOutPart.file.folder.location)
        }
        $scope.buildPackageButtonOnClick = function(){
                activeBom.makePdf(()=>{})
                //activeBom.makeProductionFolder(()=>{})
        }
        

        /* Bom View */
        $scope.deleteBomRecordButtonOnClick=function(id){
            activeBom.deleteFromBom(id)
        }
        $scope.coreIncludedCheckBoxOnChange = function (bom){
            
            if(bom.coreIncluded){
                edit(bom.id,'coreIncluded','BOMS',false,(err,res)=>{
                    if(err){activeBom.getBom()}
                })
            }
            else{
                edit(bom.id,'coreIncluded','BOMS',true,(err,res)=>{
                    if(err){activeBom.getBom()}
                })
            }
            
        }
        $scope.redlineIncludedCheckBoxOnChange = function (bom){
            if(bom.rlIncluded){
                edit(bom.id,'redlineIncluded','BOMS',false,(err,res)=>{
                    if(err){activeBom.getBom()}
                })
            }
            else{
                edit(bom.id,'redlineIncluded','BOMS',true,(err,res)=>{
                    if(err){activeBom.getBom()}
                })
            }
           
        }
        $scope.packIncludedCheckBoxOnChange = function (bom){
    
            if(bom.packIncluded){
                edit(bom.id,'packIncluded','BOMS',false,(err,res)=>{
                    if(err){activeBom.getBom(()=>{callback()})}
                })
            }
            else{
                edit(bom.id,'packIncluded','BOMS',true,(err,res)=>{
                    if(err){activeBom.getBom(()=>{callback()})}
                })
            }
        }
        $scope.changedOnClick = function(part,bom){
            bom.rev = part.rev
            bom.redlineRev = part.redlineRev
            bom.packRev = part.packRev
            edit(bom.id,'coreRev','BOMS',part.rev,()=>{})
            edit(bom.id,'redlineRev','BOMS',part.redlineRev,()=>{})
            edit(bom.id,'packRev','BOMS',part.packRev,()=>{})
        }
        $scope.itemOnChange = function(bom){
            edit(bom.id,'item','BOMS',bom.item,(err,res)=>{
                if(err){activeBom.getBom()}
            })
    
        }
        $scope.revOnChange = function(bom){
            edit(bom.id,'coreRev','BOMS',bom.rev,(err,res)=>{
                if(err){activeBom.getBom(()=>{callback()})}
            })
    
        }
        $scope.qtyOnChange = function(bom){
            edit(bom.id,'qty','BOMS',bom.qty,(err,res)=>{
                if(err){activeBom.getBom(()=>{
                    console.log('Error Updating Qty',err,res)
                })}
            })
    
        }
        $scope.refreshBomButtonOnClick = function(){
            activeBom.getBom(()=>{
                activeBom.file.seeIfExists()
                activeBom.seeIfBomFilesExists()
                activeBomIdHistory[activeBomIdHistory.length] = activeBom.id
                activeBom.exportBom()
                $scope.reload()
            })
            activeBom.getPart(()=>{})
        }

        /*Nav Bar*/
        $scope.navBarHomeOnClick = function (){
            //resetPanes()
            //document.getElementById('partTable').style.display = 'grid'
            window.location.href = 'update.html'
        
        }
        $scope.navBarScopeOnClick = function (){
            schemes.getSchemes()
            resetPanes()
            document.getElementById('scopePane').style.display = 'grid'  
        }
        $scope.navBarSettingsOnClick = function (){
            resetPanes()
            document.getElementById('settingsPane').style.display = 'grid'
            document.getElementById('partTable').style.display = 'grid'
            document.getElementById('partTable').style.gridRowStart = 'M1'
            document.getElementById('partTable').style.gridRowEnd = 'M2'
            document.getElementById('partTable').style.gridColumnStart = 'M1'
            document.getElementById('partTable').style.gridColumnEnd = 'M1'
        }
        $scope.navBarHelpOnClick = function (){
          
        }
        function resetPanes(){
                document.getElementById('partTable').style.display = 'none'
                document.getElementById('partTable').style.gridRowStart = 'M1'
                document.getElementById('partTable').style.gridRowEnd = 'M2'
                document.getElementById('partTable').style.gridColumnStart = 'M1'
                document.getElementById('partTable').style.gridColumnEnd = 'R'
                document.getElementById('bomTable').style.display = 'none'
                document.getElementById('partSlideOutBar').style.display = 'none'
                document.getElementById('scopePane').style.display = 'none'
                document.getElementById('settingsPane').style.display = 'none'
        
        }

        /*Scope Pane*/
        $scope.deleteScopeButtonOnClick =function(id){
            schemes.deleteScheme(id,()=>{
                schemes.getSchemes(()=>{})
            })
        }
        $scope.addScopeButtonOnClick =function(){
            let fileAs = document.getElementById('scopeFileAsInput').value
            let displayAs = document.getElementById('scopeDisplayAsInput').value
            schemes.newScheme(fileAs,displayAs,()=>{
                schemes.getSchemes(()=>{})
            })
        }

        /*Settings Pane */
        $scope.autoNumberOnChange = function(){
            config.autoNumber = $scope.config.autoNumber
            saveConfig()
        }



})
document.getElementById('descriptionSearch').onkeypress=(event)=>{
    let keyNotAllowed = event.key==';'||event.key=="'"
    if(keyNotAllowed){event.preventDefault()}
}
window.onload= ()=>{
    console.log('Page Loaded')
    loadScreen.style.display='none'
}

let vmSettings = new Vue({
    el:'#settingsPane',
    data:{
        config:config,
        database:database
    },
   
    methods:{
        onBlur:function(){
                    console.log('Save Settings')
                    saveConfig()
                    saveDatabase()
                }   
        
    }
})
let vmSearch = new Vue({
    el:'#partTable',
    data:{
        partList:partList,
        partSearch:partList.parameters,
        schemes: schemes,
        panes:panes
     
    },
    methods:{
        onSearch:function(){
            partList.getPartList()
        },
        onRowClick:function(part){
            slideOutPart = part
            slideOutPart.file.seeIfExists(()=>{
                if(!slideOutPart.file.folder.exists)fs.mkdirs(slideOutPart.file.folder.location,()=>{
                    slideOutPart.file.seeIfExists(()=>{})
                })
            })
            
            slideOutPart.getPart(()=>{})
            slideOut()
            document.getElementById('footer').innerHTML =''
            document.getElementById('buildPackButton').style.background='#555'
        },
        onAddToBom:function(part){
            let bomItem = new BomItem()
            bomItem.partId = part.id

            /* Select Bom Find Number */
            if(activeBom.bom.length==0){
                bomItem.item = "001"
            }else{
                bomItem.item = Number(activeBom.bom[activeBom.bom.length-1].item)
                bomItem.item++
                bomItem.item = bomItem.item.toString()
                if(bomItem.item.length==0){bomItem.item = "000"+bomItem.item}
                if(bomItem.item.length==1){bomItem.item = "00"+bomItem.item}
                if(bomItem.item.length==2){bomItem.item = "0"+bomItem.item}
            }
            
            
            activeBom.addToBom(bomItem,part,()=>{
                let bomTableBody = document.getElementById('bomTableBody')
                bomTableBody.scrollTop = bomTableBody.scrollHeight
            })
        }
    }
  
})

 
function runSql (query,callback){
    console.log(query)
    let startTime = new Date()
    busy++

    document.getElementById('body').style.cursor='progress'

    /* Close Sql connection after running callback */
    let callbackAndClose = function(err,res){
        if(err){
            console.log(err)
        }
        else{
            console.log('Response Recived')
        }

        if(callback){callback(err,res)}
        let endTime = new Date()
        console.log('time',endTime - startTime)

        busy--
        if(busy==0){document.getElementById('body').style.cursor=''}
        console.log(busy)
        sql.close()
    }

	const connectionString  = {
        user: database.user,
        password: database.password,
        server: database.server,
        database: database.database,
        connectionTimeout: 30000,
        options: {
            encrypt: false
        }
    }
    
    let pool = new sql.ConnectionPool(connectionString)
    pool.connect((err)=>{
        var request = new sql.Request(pool)
     
        if (err) {console.log(err)} 
        else { 
            busy++
            document.getElementById('body').style.cursor='progress'
            request.query(query,callbackAndClose)
            console.log('Query Passed')
        }
        busy--
        if(busy==0){document.getElementById('body').style.cursor=''}
        
    })


    

}
setInterval(()=>{
    document.getElementById('body').style.cursor=''
},2000)

function removeWhiteSpace(str){
    if(str){str = str.trim()}
    if (str == "NULL"|| str=="null"){str=''}
	return str
}
function edit(id,column,table,value,callback){

    let query = "UPDATE "+table+" SET "+column+" = '"+value+"'"
    query =query+" WHERE ID="+id
    
   runSql(query,(err,res)=>{
        console.log('updated')
        if(callback){callback(err,res)}
    })
}
function autoNumber(callback){
    config = JSON.parse(fs.readFileSync( "I:\\Parts\\FMH\\FMH102\\FMH10223\\config\\config.json", "utf8"))
    let autoNumber = config.autoNumber
    autoNumber = parseInt(autoNumber.substring(3), 10) + 1
    autoNumber = 'FMH'+autoNumber
    config.autoNumber=autoNumber
    saveConfig(callback)
    autoNumberLog.info('['+username +'] '+'['+autoNumber+'] ')
}
function saveConfig(callback){
    fs.writeFile("I:\\Parts\\FMH\\FMH102\\FMH10223\\config\\config.json",JSON.stringify(config),"UTF8",(err)=>{
        if(err){throw err}
        if(callback){callback()}
    })
}
function saveDatabase(callback){
    fs.writeFile("I:\\Parts\\FMH\\FMH102\\FMH10223\\config\\database.json",JSON.stringify(database),"UTF8",(err)=>{
        if(err){throw err}
        if(callback){callback()}
    })
}
function updateAll(callback){
    fs.copy("I:\\Parts\\FMH\\FMH102\\FMH10223\\application","resources\\app",(err)=>{
        if(err){console.log(err)}
        else{console.log('updated all')}
        if(callback){callback()}
    })
}
function toCSV(array){
    // Converts an array of single level objects to CSV
    let file = ''
    let columns = Object.keys(array[0]).length
    let rows = array.length
    for(let i=0;i<rows;i++){
        for(let key in array[i]){
           file = file + "\"" + array[i][key]+ "\"" +','
        }
       //if(i!==rows-1){file = file + "\n"}
       file = file + "\n"
    }
    return file
}
function copyBom(){
    //copies bom from slide out part to active bom
    let bom = new Part()
    bom.id = slideOutPart.id
    
    bom.getBom(()=>{
        bom.id = activeBom.id
        bom.saveBom()
    })
}

function slideOut(){
    let partSlideOutBar =  document.getElementById('partSlideOutBar')
    partSlideOutBar.style.display='grid'

    let partTable=document.getElementById('partTable')
    partTable.style.gridColumnEnd = 'M1' 

    let bomTable=document.getElementById('bomTable')
    bomTable.style.gridColumnEnd = 'M1'

    let settingsPane = document.getElementById('settingsPane')
    settingsPane.style.display='none'
}

//electron-packager ./ part-control --electronVersion=3.0.10 --platform=win32 --arch=ia32 --icon=icon.ico --prune=true --out=release-builds 