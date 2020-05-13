'use strict';

const {app, BrowserWindow,Menu, MenuItem, shell} = require('electron')

const sql = require('mssql')
let fs = require('fs-extra')
let htmlPdf = require('html-pdf')
let ezPdfMerge = require('easy-pdf-merge')


let configPath = "I:\\Parts\\FMH\\FMH102\\FMH10223\\config\\"

if(!fs.existsSync(configPath)){
    configPath="Z:\\Shared\\FMH\\Engineering\\Parts\\FMH\\FMH102\\FMH10223\\config\\"
}


let config = JSON.parse(fs.readFileSync( configPath+"config.json", "utf8"))
config.save = ()=>{
    fs.writeFile(config.rootDir + "FMH\\FMH102\\FMH10223\\config\\config.json",JSON.stringify(config),"UTF8")
}

let database = JSON.parse(fs.readFileSync( configPath+"database.json", "utf8"))
database.save = ()=>{
    fs.writeFile("I:\\Parts\\FMH\\FMH102\\FMH10223\\config\\database.json",JSON.stringify(database),"UTF8")
}

if(!fs.existsSync(config.rootDir)){
    config.rootDir="Z:\\Shared\\FMH\\Engineering\\Parts\\"
}
if(!fs.existsSync(config.aceTemplateFolder)){
    config.aceTemplateFolder="Z:\\Shared\\FMH\\Engineering\\Parts\\Parts\\AutoCad Electrical\\Template Folder\\"
}


let username = logUsername()


let Part = function (){
    this.id='000'
    this.partNumber=''
    this.description=''
    this.scheme=''
    this.type=''
    this.coreRev=''
    this.status = ''
    this.redlineRev=0
    this.packRev=0
    this.changed=false
    this.bom = []
    this.certs = []
    this.owner = ''
    this.notes = ''
    this.isRevControlled = false
    this.resolvedBom = []

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
     
        getPaths:()=>{
            let revExt = ' REV '+this.coreRev
            if(!this.coreRev){
                revExt = ''
            }

            if(this.scheme=='FMH'){
                this.file.folder.location = config.rootDir+this.scheme+"\\"+this.partNumber.substring(0, 6)+"\\"+this.partNumber
                this.file.core.location = this.file.folder.location+"\\REV "+this.coreRev+"\\"+this.partNumber+revExt+".pdf"
            }else{
                this.file.folder.location = config.rootDir+this.scheme+"\\"+this.partNumber
                this.file.core.location = this.file.folder.location+"\\"+this.partNumber+revExt+".pdf"
            }
           
            this.file.redline.location = this.file.folder.location+"\\"+"Redlines"+"\\"+this.partNumber+revExt+" RL"+this.redlineRev+".pdf"
            this.file.pack.location = this.file.folder.location+"\\"+"Production Packages"+"\\"+"PK"+this.packRev+"\\"+this.partNumber+revExt+" PK"+this.packRev+".pdf"
            this.file.index.location = this.file.folder.location+"\\"+"Production Packages"+"\\"+"PK"+this.packRev+"\\"+this.partNumber+revExt+" PK"+this.packRev+" INDEX.pdf"
            
        }
    }
    this.getPart=async(callback)=>{
        let query = "SELECT * FROM  partMaster  WHERE id= '"+this.id+"' "
        if(this.id=='000'){query = "SELECT * FROM  partMaster WHERE partNumber= '"+this.partNumber+"' AND scheme='"+this.scheme+"' "}
        let res = await runSql(query)  
        console.log(res)
        let record = res.recordset[0]

        if(res.recordset.length==1){
            this.id = record.id
            this.partNumber= removeWhiteSpace(record.partNumber)
            this.scheme=   record.scheme.trim()
            this.description= record.description.trim()
            this.coreRev=  removeWhiteSpace(record.coreRev)
            this.redlineRev= record.redlineRev
            this.type= removeWhiteSpace(record.type)
            this.packRev=record.packRev
            this.status = removeWhiteSpace(record.status)
            this.owner = removeWhiteSpace(record.owner)
            this.notes = record.notes
            this.isRevControlled = record.isRevControlled

            this.file.getPaths()     
            this.seeIfFilesExists()
            this.getCerts(()=>{})
        }
        if(callback){callback()}
        
    }
    this.getBom=async(callback)=>{

            let query = "SELECT * FROM  boms left join partMaster on boms.partId=partMaster.id WHERE  (bomId='"+this.id+"') ORDER BY case when item is null then 1 else 0 end, item"
            let res = await runSql(query)
            let recordSet = []
            if(res){recordSet = res.recordset}

            let bom = []
            let part = []
            for(let i=0;i<recordSet.length;i++){
                let res = recordSet [i]  
                bom[i] = {}
                bom[i].id = res.id[0]
                bom[i].item= removeWhiteSpace(res.item)
                bom[i].partId= res.partId
                bom[i].qty= res.qty
                bom[i].coreRev= removeWhiteSpace(res.coreRev[0])
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
                part[i].coreRev = removeWhiteSpace(res.coreRev[1])
                part[i].redlineRev=res.redlineRev[1]
                part[i].type = removeWhiteSpace(res.type)
                part[i].packRev = res.packRev[1]
                part[i].status = res.status
                if(part[i].status){part[i].status = part[i].status.trim()}
                part[i].file.getPaths()

                bom[i].part=part[i]
              
            }
            this.bom = bom
           
            if(callback){callback()}
      
    
    }
    this.bomChanged= async ()=>{
  
        let bom = this.bom

        for(let i=0; i<bom.length && !this.changed; i++){ 
            
            if( (bom[i].part.type=='ASSY'||bom[i].part.type=='SUB')&& bom[i].part.id!==this.id ){
                
                await bom[i].part.getBom()
                bom[i].part.bomChanged()
                if(bom[i].part.changed){this.changed=true}
                    
            }
            if(bom[i].coreRev!==bom[i].part.coreRev||bom[i].redlineRev!==bom[i].part.redlineRev||bom[i].part.packRev!==bom[i].packRev||bom[i].part.changed){
                this.changed=true
      
            }
           
                
        }
    
    }
    this.seeIfFilesExists = async ()=>{
          
        this.file.getPaths()
      
        let exists = await fs.exists(this.file.core.location)
        this.file.core.exists = exists

        exists = await fs.exists(this.file.redline.location)
        this.file.redline.exists = exists
    
        exists = await fs.exists(this.file.pack.location)
        this.file.pack.exists = exists

        exists = await fs.exists(this.file.index.location)
        this.file.index.exists = exists

        exists = await fs.exists(this.file.folder.location)
        this.file.folder.exists = exists
   
        exists = await fs.exists(this.file.rootDir.location)
        this.file.rootDir.exists = exists
    }
    this.seeIfBomFilesExists = ()=>{
        for(let i=0;i<this.bom.length;i++){
            this.bom[i].part.seeIfFilesExists()
        }
    }
    this.addToBom=(bomItem,callback)=>{
        let part = bomItem.part
        console.log('add to bom')
        if(!part.coreRev){part.coreRev=''}
    
        /*Append Array for Imidiate Display on the screen  */
        let bomItemLocation = this.bom.length // rememember location in array so it can be updated after responce
        this.bom[bomItemLocation]=bomItem
        

    
        /* Add to SQL */
        let query = "INSERT INTO boms (bomId,partId,item,coreRev) OUTPUT Inserted.ID "
        query = query + " VALUES ('"+this.id+"','"+bomItem.partId+"','"+bomItem.item+"','"+part.coreRev+"')"
        runSql(query,(err,res)=>{
            if(err){throw err}
            this.bom[bomItemLocation].id=res.recordset[0].ID
            this.bom[bomItemLocation].part.seeIfFilesExists()
            if(callback){callback()}
        })
    
    }
    this.deleteFromBom=(id)=>{
        for(let i=0; this.bom.length>i; i++){
            if(id==this.bom[i].id){
                this.bom.splice(i,1)
            }
        }
    
        let query ="Delete from boms WHERE id='"+id+"';"
        runSql(query,(err,res)=>{
            if(err){console.log(err)}else{console.log('Deleted')}
        }) 
    }
    this.makeIndexSheet = async ()=>{
        this.file.getPaths()
        removeFile(this.file.index.location,()=>{})
    
    
        let makeHtmlIndexSheet = ()=>{
            let bom = this.bom
         
    
            let rows = ""
            for(let i=0;i<bom.length;i++){
            
        
            /* Define Change Flag*/
            let changeFlag=''
            if(bom[i].coreRev!==bom[i].part.coreRev||bom[i].redlineRev!==bom[i].part.redlineRev){
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
            /*Part Number*/     row=row+"<td>"+bom[i].part.partNumber+"</td>"
            /*Description*/     row=row+"<td>"+bom[i].part.description+"</td>"
            /*Quantity*/        row=row+"<td>"+bom[i].qty+"</td>"
            /*Changed Flag*/    row=row+"<td class='changed'>"+changeFlag+"</td>"
            /*Core Rev*/        row=row+"<td>"+bom[i].coreRev+"</td>"
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
            let title="<div style='"+titleStyle+"'>"+this.scheme+" "+this.partNumber+" REV "+this.coreRev+"-"+this.packRev+" "+this.description+"</div>"
            let table="<table style='"+tableStyle+"'><thead>"+heading+"</thead><tbody>"+rows+"</tbody></table>"
        
            return title+table+footer
        }
    
        let htmlIndexSheet = makeHtmlIndexSheet()
      
        await htmlToPdf(htmlIndexSheet,this.file.index.location)
        if(typeof(callback)=='function'){callback()}
        function removeFile(path,callback){
            fs.remove(path,(err)=>{
                if(err){console.log(err)}
                callback()
            })
        }
       
        function htmlToPdf(html,path){
            return new Promise((resolve,reject)=>{
                console.log('make index sheet at '+path)
                let options = {height: "11in", width: "17in", border: ".5in"}
                let htmlFile = htmlPdf.create(html,options)
                htmlFile.toFile(path,(err,res)=>{
                    if(err){
                        reject(err)
                        console.log(err)
                    }
                    else{
                        resolve()
                        console.log('PDF Index Sheet Made and put at ', res.filename)
                    }
                    
              
                })
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
    this.getPartId = async(callback)=>{
        let query = "select id from partMaster where partNumber = '"+this.partNumber+"' and scheme = '"+this.scheme+"'"
        let res = await runSql(query)
        if(res.recordset.length>0){
            this.id = res.recordset[0].id
            this.getPart(callback)
        }
        else{
            console.log('part does not exist in DB')
        }
    }
    this.savePart= async(callback)=>{
        let newPart = async ()=>{
   
            let query = "insert into partMaster (partNumber,scheme,type,coreRev,packRev,status,owner,isRevControlled,description)"+
            " VALUES('"+this.partNumber+"','"+this.scheme+"','"+this.type+"','"+this.coreRev+"','"+this.packRev+"','"+this.status+"','"+username+"','"+this.isRevControlled+"','"+this.description+"'); SELECT @@IDENTITY AS 'Identity'; "
            
            await this.file.seeIfFilesExists()
            if(!this.file.folder.exists){
                await fs.mkdir(this.file.folder.location)
            }
            
            let res = await runSql(query)
         
            this.id= res.recordset[0].Identity
            console.log('added id:'+this.id)
            await this.getPart()
            
                
      
        
        }
        let updatePart = async ()=>{
            let queryValues = " "+
            "   partNumber='"           +this.partNumber            +"' "+
            " , description='"          +this.description           +"' "+
            " , type='"                 +this.type                  +"' "+
            " , coreRev='"              +this.coreRev               +"' "+
            " , redlineRev='"           +this.redlineRev            +"' "+
            " , packRev='"              +this.packRev               +"' "+
            " , status='"               +this.status                +"' "+
            " , owner='"                +this.owner                 +"' "+
            " , notes='"                +this.notes                 +"' "+
            " , isRevControlled='"      +this.isRevControlled       +"' "+
            " "
    
            let query = " UPDATE partMaster SET "+queryValues+"  WHERE id= '"+this.id + "'"
            
    
            
            await fs.mkdirs(this.file.folder.location)
            
    
            if(this.partNumber!=='' || this.scheme==''){ await runSql(query)}
            else{console.log('Error: can not save a blank part number or scope')}

  
        }
        let partExists = await this.partExists()
 
        if(partExists==0){
            await newPart()
            console.log('Part Created')
        }
        else{
            await updatePart()
            console.log('Part Updated')
        }

        if(typeof(callback)=='function'){callback()}
  
     
    }
    this.delete=async(callback)=>{
        let query = " DELETE FROM partMaster WHERE id = '"+this.id+"' "
        await runSql(query)
        this.reset()
        if(typeof(callback)=="function"){callback()}
    }
    this.reset=()=>{
        this.id='000'
        this.partNumber=''
        this.description=''
        this.scheme=''
        this.type=''
        this.coreRev=''
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
    this.partExists = async (callback)=>{
    
        let query = "SELECT * FROM  partMaster WHERE partNumber= '"+this.partNumber+"' AND scheme = '"+this.scheme+"'"
        let res = await runSql(query) 
        res = res.recordset.length 
        if(callback){callback(res)}
     
        return res
    
    }
    this.makePdf = async (callback) =>{
            /* In order to display a progress bar */
            let progressBar = document.getElementById('buildPackProgressBar')
            progressBar.style.width='5%'
            progressBar.style.display='block'
    
            /*Rev the pack */
            edit(this.id,'packRev','partMaster',this.packRev+1,()=>{

            })
            this.packRev = this.packRev+1
           
            await this.getBom()
            progressBar.style.width='30%'
            activeBom.seeIfBomFilesExists()
                    
            let pdfFiles = this.getProductionPackage()
            let pdfDestPath = this.file.pack.location
            progressBar.style.width = '60%'
            
            console.log('index sheet 1')
            await this.makeIndexSheet()
            console.log('index sheet 3')
            progressBar.style.width = '80%'
            ezPdfMerge(pdfFiles,pdfDestPath,(err)=>{
                        if(err){
                            progressBar.style.background='RED'
                            console.log(err)
                            if(callback){callback(err)}
                            setTimeout(()=>{
                                progressBar.style.display='none'
                                progressBar.style.background='#17c11a'
                            },2000)
                        }
                        else{
                            console.log('pdf made and put at ')
                            console.log(pdfDestPath)
                            if(callback){callback()}
                            progressBar.style.width = '100%'
                            vmPart.part.getPart(()=>{progressBar.style.display='none'})
                        }
            }) 
    }
    this.getProductionPackage = ()=>{
            let bom  = this.bom
            let bomPart = this.bomParts
    
            let pdfFiles=[]
    
            /*Pull in main drawing and index */
            let pdfFilesLength=2
            this.file.getPaths()
            this.seeIfFilesExists()
    
            pdfFiles[0] = this.file.index.location
            if(this.file.core.exists){pdfFiles[1] = this.file.core.location}
            else{pdfFilesLength=1}
        
                    for (let i=0;i<bom.length; i++){
                     
                        bom[i].part.file.getPaths()
                      
                        /*Production Package */ let pdfProdPath = bom[i].part.file.pack.location
                        /*Standard Drawing  */	let pdfStdPath = bom[i].part.file.core.location
                        /*Redline Drawing  */	let pdfRedlinePath = bom[i].part.file.redline.location
                       
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
    this.revRedline = async (callback)=>{
      
        this.redlineRev = this.redlineRev+1
        this.file.getPaths()
        await fs.mkdirs(this.file.folder.location+"\\Redlines")
        await this.savePart() 
        if(typeof(callback)=='function'){callback()}
        
     
    }
    this.setRedlineRev = async (rev,callback)=>{
        await edit(this.id,'redlineRev','partMaster',rev)
        this.redlineRev=rev
        if(callback){callback()}
    }
    this.addFile = async(path,drawingType)=>{
          /* Define Drawing Paths */ 
          
          let destinationPath = ''
          if (drawingType=='core'){
              destinationPath = this.file.core.location
          }
          if (drawingType=='redline'){
              await this.revRedline()
              await this.getPart()
              destinationPath = this.file.redline.location 
          }
          console.log('dest path', destinationPath)
  
          /* Read File*/
          let pdfFile = await fs.readFile(path)
  
          /* Write File*/ 
          let exists = await fs.exists(destinationPath)
          let writeDrawing = false
          if(exists){
              writeDrawing = confirm("This drawing already exists, would you like to overwrite it?");
          }
          else{
              writeDrawing = true
          }
  
          if(writeDrawing){
              console.log('Destination: '+destinationPath)
  
              let err = await fs.writeFile(destinationPath,pdfFile,'UTF8')
              if(err){
                  document.getElementById('footer').innerHTML = 'Error Adding File'
                  console.log('Error Adding File',err)
              }
              else{
                  document.getElementById('footer').innerHTML = ''
                  this.seeIfFilesExists()
              }
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
                    this.list[i].getBom(()=>{
                        this.list[i].bomChanged()
                        vmSearch.$forceUpdate()
                    })

                }

            }
           
            if(callback){callback()}
           
        })

    }
   
}
let scopes = []
scopes.get = async function (){
    let query = 'SELECT * FROM schemes ORDER BY displayAs '
    let res = await runSql(query)

    res = res.recordsets[0]

    for(let i=0;i<res.length;i++){
        scopes[i] = {}
        scopes[i].scope =res[i].displayAs.trim()
        scopes[i].id =res[i].id
        scopes[i].delete = async function(){
            let query = "DELETE FROM schemes WHERE "+scopes[i].id +" = id"
            await runSql(query)
        }
    }
 
}
scopes.add = async function(name){
    let query = "INSERT INTO schemes (scheme, displayAs) VALUES ( '" + name + "' , '"+name + "' )" 
    await runSql(query)
    await fs.ensureDir(config.rootDir+scheme)
    await scopes.get()
}

scopes.get()
let Scheme = function(){
    this.schemes = []
    this.getSchemes = (callback)=>{
        let query = 'SELECT * FROM schemes ORDER BY displayAs '
        runSql(query,(err,res)=>{
        
            this.schemes = []
            res = res.recordsets[0]
      
            for(let i=0;i<res.length;i++){
                this.schemes[i] = {}

                this.schemes[i].scope =res[i].displayAs.trim()
                this.schemes[i].id =res[i].id
         
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
        "  VALUES ('"+vmPart.part.id+"','"+vmPart.selectedCert +"');"

        runSql(query,(err,res)=>{if(err){throw err}})
    }

}


let panes = {
    get bom(){
        return document.getElementById('bomModule').style.display =='grid'
    },
    set bom(value){
        if(value){
            document.getElementById('partTable').style.gridRowStart ='M2'
            document.getElementById('bomModule').style.display='grid'
           // document.getElementById('bomTableBody').scrollTop = 0
        }
        else{
            document.getElementById('partTable').style.gridRowStart ='M1'
            document.getElementById('bomModule').style.display='none'
        }
    },
    get part(){
        return document.getElementById('partSlideOutBar').style.display=='grid'
    },
    set part(value){
        if(value){
            let partSlideOutBar =  document.getElementById('partSlideOutBar')
            partSlideOutBar.style.display='grid'
    
            let partTable=document.getElementById('partTable')
            partTable.style.gridColumnEnd = 'M1' 
    
            let bomModule=document.getElementById('bomModule')
            bomModule.style.gridColumnEnd = 'M1'
    
            let settingsPane = document.getElementById('settingsPane')
            settingsPane.style.display='none'
        }
        else{
            document.getElementById('partSlideOutBar').style.display='none'

            document.getElementById('partTable').style.gridColumnEnd = 'R' 
           
            document.getElementById('bomModule').style.gridColumnEnd = 'R'
           
        }
    },
    get partTable(){
        return    document.getElementById('partTable').style.display=='grid'
    },
    set partTable(value){
        if(value){
            document.getElementById('partTable').style.display='grid'
        }
        else{
            document.getElementById('partTable').style.display='none'
        }
    },
    get promptBox(){
        return    document.getElementById('promptBox').style.display=='grid'
    },
    set promptBox(value){
        if(value){
            document.getElementById('promptBox').style.display='grid'
        }
        else{
            document.getElementById('promptBox').style.display='none'
        }
    },
    get settings(){
        return    document.getElementById('settingsPane').style.display=='grid'
    },
    set settings(value){
        if(value){
            let settingsPane = document.getElementById('settingsPane')
            settingsPane.style.display='grid'
        }
        else{
            let settingsPane = document.getElementById('settingsPane')
            settingsPane.style.display='none'
        }
    }

}


function logUsername(){
    const username = require('username');
    let user = username.sync()
    const userLog = require('simple-node-logger').createSimpleLogger({
            logFilePath: config.rootDir+'FMH\\FMH102\\FMH10223\\logs\\logIns.log',
            timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
        })
    userLog.info(user)
    return user
}
const filesViewdLog = require('simple-node-logger').createSimpleLogger({
    logFilePath:config.rootDir+'FMH\\FMH102\\FMH10223\\logs\\filesViewd.log',
    timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
})

const autoNumberLog = require('simple-node-logger').createSimpleLogger({
    logFilePath:config.rootDir+'FMH\\FMH102\\FMH10223\\logs\\autoNumber.log',
    timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
})


let schemes = new Scheme()
let partList = new PartList()
let activeBom = new Part()
let certifications = new Certification ()




let vmSettings = new Vue({
    el:'#settingsPane',
    data:{
        config:config,
        database:database,
        list: [],
        selectedList:""
    },
   
    methods:{
        onBlur:function(){
            console.log('Save Settings')
            config.save()
            database.save()
          
        },
        onListSelect(){
            vmSettings.list = []

            //* Select Scopes */
            if(vmSettings.selectedList=='Scopes'){
                for(let i = 0;i<schemes.schemes.length;i++){
                    vmSettings.list[i] = scopes[i].scope
                }
       
            }
            //* Select Certifications */
            if(vmSettings.selectedList=='Certifications'){
                for(let i = 0;i<certifications.certifications.length;i++){
                    vmSettings.list[i] = certifications.certifications[i].name
                }
       
            }
            //* Select Types */
            if(vmSettings.selectedList=='Types'){
                for(let i = 0;i<certifications.certifications.length;i++){
                    vmSettings.list[i] = certifications.certifications[i].name
                }
       
            }
        }
    }
})
let vmSearch = new Vue({
    el:'#partTable',
    data:{
        partList:partList,
        partSearch:partList.parameters,
        scopes: scopes,
        panes:panes
     
    },
    methods:{
        onSearch:function(){
            partList.getPartList()
        },
        onRowClick:selectPart,
        onAddToBom:function(part){
            if(part.id==vmBom.bom.id){return}

            let bomItem = {}
            bomItem.partId = part.id
            bomItem.part = part

            bomItem.coreRev = part.coreRev
            bomItem.packRev = part.packRev
            bomItem.redlineRev = part.redlineRev

            /* Select Bom Find Number */
            if(vmBom.bom.bom.length==0){
                bomItem.item = "001"
            }else{
                bomItem.item = Number(vmBom.bom.bom[vmBom.bom.bom.length-1].item)
                bomItem.item++
                bomItem.item = bomItem.item.toString()
                if(bomItem.item.length==0){bomItem.item = "000"+bomItem.item}
                if(bomItem.item.length==1){bomItem.item = "00"+bomItem.item}
                if(bomItem.item.length==2){bomItem.item = "0"+bomItem.item}
            }
            
            
            vmBom.bom.addToBom(bomItem,()=>{
                let bomTable = document.getElementById('bomTable')
                bomTable.scrollTop = bomTable.scrollHeight
                vmBom.$forceUpdate()
            })
         
        },
        partMasterOnClick:function(){
            panes.part=1
        }
    }
  
})
let vmBom = new Vue({
    el:'#bomModule',
    data:{
        bom:activeBom,
        activeBomIdHistory:[]
    },
    methods:{
        onRowClick: selectPart,
        onChange:function(part,column){
            if(column=="coreRev"){
                part[column] = part[column].toUpperCase()
            }
            let elm = document.getElementById(column+part.id)
            elm.style.background = '#17c11a'
            edit(part.id,column,'boms',part[column],(err,res)=>{
                console.log(res)
                if(err){
                   console.log(err)
                   elm.style.background = 'red'
                }
                else{
                    elm.value = res
                    elm.style.background = ''
                }
               
            })

        },
        checkBoxOnChange:function(part,column){
            let elm = document.getElementById(column+part.id)
            part[column] = !part[column]
            edit(part.id,column,'boms', part[column] ,(err,res)=>{
                if(err){throw err}
             
                elm.style.background = '' 
            })
        },
        changedOnClick:function(bomRow){
            let elm = document.getElementById("changed"+bomRow.id)
            elm.style.background = '#17c11a'

            

            edit(bomRow.id,'coreRev','boms',bomRow.part.coreRev,(err,res)=>{after(err,res)})
            edit(bomRow.id,'packRev','boms',bomRow.part.packRev,(err,res)=>{after(err,res)})
            edit(bomRow.id,'redlineRev','boms',bomRow.part.redlineRev,(err,res)=>{after(err,res)})

            let responseRecived = 0
            let errRecived = false
            function after(err){
                if(err){errRecived=true}
                responseRecived++
                if(responseRecived==3 && errRecived==0){
                    elm.style.background=''
                    bomRow.coreRev =  bomRow.part.coreRev
                    bomRow.rlRev =   bomRow.part.rlRev
                    bomRow.packRev = bomRow.part.packRev
                }
            }
        },
        onDelete:function(bomRow){
            vmBom.bom.deleteFromBom(bomRow.id)
            vmBom.$forceUpdate()
        },
        onRefresh:function(){
            vmBom.bom.getBom(()=>{
                vmBom.bom.seeIfFilesExists()
                vmBom.bom.seeIfBomFilesExists()
                vmBom.activeBomIdHistory[vmBom.activeBomIdHistory.length] = vmBom.bom.id
                vmBom.$forceUpdate()
            })
        },
        onClose:function(){
            panes.bom = 0
        },
        onBack:function(){
            console.log('active bom',vmBom.bom.id)
            vmBom.bom.id = vmBom.activeBomIdHistory[vmBom.activeBomIdHistory.length-2]
            vmBom.bom.getPart(()=>{})
            vmBom.bom.getBom(()=>{
                vmBom.bom.seeIfFilesExists()
                vmBom.bom.seeIfBomFilesExists()
                vmBom.activeBomIdHistory.length = vmBom.activeBomIdHistory.length-1
            })
        },
        isChanged:function(bomRow){
            return(bomRow.coreRev!==bomRow.part.coreRev || bomRow.packRev!==bomRow.part.packRev || bomRow.redlineRev!==bomRow.part.redlineRev)
        }
    }
})
let vmPart = new Vue({
    el:'#partSlideOutBar',
    data:{
        part: new Part(),
        schemes: schemes,
        certs: certifications,
        vmBom: vmBom,
        panes: panes,
        selectedCert:'',
        saveButtonEnabled: false
    },
    methods:{
        onClose:function(){
            panes.part = 0
        },
        openBom:async function(){

            vmBom.bom = vmPart.part
            await vmBom.bom.getBom()
            vmBom.bom.seeIfFilesExists()
            vmBom.bom.seeIfBomFilesExists()
            vmBom.activeBomIdHistory[vmBom.activeBomIdHistory.length] = vmBom.bom.id
            panes.bom=1
          
        },
        onPartNumberChange:async function(){
            vmPart.saveButtonEnabled = true
            let exists  = await vmPart.part.partExists()
            if(!exists){return}
            vmPart.part.getPart()
        },
        onAnyChange:function(){
            vmPart.saveButtonEnabled = true
            console.log('any change')
        },
        saveOnClick:async function(){
            await vmPart.part.savePart() 
            vmPart.saveButtonEnabled = false
            vmPart.part.getPart()
        },
        newOnClick:function(){
            vmPart.part = new Part()
           
        },
        deleteOnClick:function(){
            let deletePart = confirm("Are you sure you want to delete this part?")
            if(deletePart){
                vmPart.part.delete(()=>{})
            }
        },
        autoNumberOnClick:async function(){
            await autoNumber()
            vmPart.part.partNumber = config.autoNumber
            vmPart.part.scheme='FMH'
            vmPart.part.type='ASSY'
            vmPart.part.coreRev='1'
            vmPart.part.status=''
            
            await vmPart.part.seeIfFilesExists()
            if(vmPart.part.file.folder.exists==true){return}
        
            await vmPart.part.savePart()
            await makeAceProject()
            vmPart.part.getPartId(vmPart.part.getPart)
        },
        notesOnClick:function(){
            panes.promptBox = true
        },
        openCore:function(){
            shell.openItem(vmPart.part.file.core.location)
        },
        openRedline:function(){
            shell.openItem(vmPart.part.file.redline.location)
        },
        openPack:function(){
            shell.openItem(vmPart.part.file.pack.location)
        },
        openFolder:function(){
            shell.openItem(vmPart.part.file.folder.location)
        },
        buildPack:async function(){
            await vmBom.bom.makePdf()
            vmPart.part.getPart()
        },
        addCert:function(){
            certifications.addCertToPart()
            vmPart.part.getCerts(vmPart.part.getPart)
        },
        deleteCert:function(id){
            vmPart.part.deleteCert(id)
            vmPart.part.getCerts( vmPart.part.getPart)
        }
    }
})
let vmNavBar = new Vue({
    el:'#navBar',
    methods:{
        home:function(){
            document.getElementById('scopePane').style.display = 'none'
            document.getElementById('settingsPane').style.display = 'none'
            panes.part = 0
            panes.partTable = 1
        },
        homeDblClick:function(){
            window.location.href = 'update.html'
        },
        scopes:function(){
            schemes.getSchemes(()=>{
                vmScopes.$forceUpdate()
            })
            panes.partTable = 0
            panes.bom = 0
            panes.part = 0
            panes.settings = 0
            document.getElementById('scopePane').style.display = 'grid'  
        },
        settings:function(){
            panes.partTable = 0
            panes.bom = 0
            panes.part = 0
            panes.settings= 1 
            document.getElementById('scopePane').style.display = 'none'  
        }
    }
})
let vmScopes = new Vue({
    el:'#scopePane',
    data:{
        scheme:schemes
    },
    methods:{
        addScope:function(){
            let fileAs = document.getElementById('scopeFileAsInput').value
            let displayAs = document.getElementById('scopeDisplayAsInput').value
          
            schemes.newScheme(fileAs,displayAs,()=>{
                document.getElementById('scopeFileAsInput').value=""
                document.getElementById('scopeDisplayAsInput').value=""
                schemes.getSchemes(()=>{
                    
                })
            })
        },
        deleteScope:function(id){
            schemes.deleteScheme(id,()=>{
                schemes.getSchemes(()=>{})
            })
        }
    }
})
let vmPromptBox = new Vue({
    el:"#promptBox",
    data:{
        part:vmPart.part
    },
    methods:{
        close:function(){
            panes.promptBox = false
        }
    }
})


async function selectPart(part){
    vmPart.part = part
    await vmPart.part.seeIfFilesExists()
    if(!vmPart.part.file.folder.exists){
        await fs.mkdirs(vmPart.part.file.folder.location)
        await vmPart.part.seeIfFilesExists()
    }
    
    await vmPart.part.getPart()
    panes.part = 1
    document.getElementById('footer').innerHTML =''
    document.getElementById('buildPackButton').style.background=null
}
async function runSql (query,callback){

    console.log(query)
    let startTime = new Date()
 
    const connectionString = database
    connectionString.connectionTimeout=30000
    connectionString.options = {}
    connectionString.options.encrypt = false
    
    let pool = new sql.ConnectionPool(connectionString)
    await pool.connect()
    let request = new sql.Request(pool)
    let res = await request.query(query)
    console.log('Response Recived')
 
    let endTime = new Date()
    console.log('time',endTime - startTime)

    await sql.close()
    let err = null
    if(typeof(callback)=='function'){callback(err,res)}

    return res

}
function removeWhiteSpace(str){
    if(str){str = str.trim()}
    if (str == "NULL"|| str=="null"){str=''}
	return str
}
async function edit(id,column,table,value,callback){

    let query = "UPDATE "+table+" SET "+column+" = '"+value+"' "+" WHERE ID="+id + "; " +
                " SELECT "+column+ " FROM "+table+ " WHERE ID="+id +"; "
    
    let res = await runSql(query)
    let err = null
    res = res.recordsets[0][0][column]
    if(typeof(res)=="string"){res = res.trim()}
 
    if(callback){callback(err,res)}
    return res
}
async function autoNumber(callback){
    let json = await fs.readFile( config.rootDir + "FMH\\FMH102\\FMH10223\\config\\config.json", "utf8")
    config = JSON.parse(json)
    let autoNumber = config.autoNumber
    autoNumber = parseInt(autoNumber.substring(3), 10) + 1
    autoNumber = 'FMH'+autoNumber
    config.autoNumber=autoNumber
    config.save()
    autoNumberLog.info('['+username +'] '+'['+autoNumber+'] ')
    if(callback){callback()}
}
async function makeAceProject(){
    let projectLocation = vmPart.part.file.folder.location +"\\"+"Working Copy\\"+vmPart.part.partNumber +" ACE"
    await fs.mkdirs(projectLocation)
    await fs.copyFile(config.aceTemplateFolder+'FMHxxxxx.WDP',projectLocation+'\\'+vmPart.part.partNumber+".WDP")
    await fs.copyFile(config.aceTemplateFolder+'FMHxxxxx.WDT',projectLocation+'\\'+vmPart.part.partNumber+".WDT")
    await fs.copyFile(config.aceTemplateFolder+'FMHxxxxx_WDTITLE.WDL',projectLocation+'\\'+vmPart.part.partNumber+"_WDTITLE.WDL")
    await fs.copyFile(config.aceTemplateFolder+'FMHxxxxx-BOM.xlsx',projectLocation+'\\'+vmPart.part.partNumber+"-BOM.xlsx")
    await fs.copyFile(config.aceTemplateFolder+'FMHxxxxx-01.dwg',projectLocation+'\\'+vmPart.part.partNumber+"-01.dwg")

    let res = await fs.readFile(projectLocation+'\\'+vmPart.part.partNumber+".WDP")
    res = res.toString('utf8')

   
    let wdp =   '*[1]' + vmPart.part.partNumber + '\n' +
                "*[2]" +vmPart.part.description + '\n' +
                "*[4]" +vmPart.part.coreRev + '\n' + '?' +
                res + '\n' +
                vmPart.part.partNumber+"-01.dwg" 

    await fs.writeFile(projectLocation+'\\'+vmPart.part.partNumber+".WDP",wdp)

}



/*Handles a file drop*/
let divDropZone = document.getElementById('dropZone')
divDropZone.ondragover = () => { event.preventDefault() }
divDropZone.ondrop = async (event) => {
        

        divDropZone.style.background = '#17c11a'
        
        /*Get the first file dropped. Ignore all others*/
        let file = event.dataTransfer.files[0]

        
        /*Error checking*/
        let err = false
        if(event.dataTransfer.files.length>1)       {err = 'Only 1 PDF can be attached'}
        if(event.dataTransfer.files.length<1)       {err = 'First copy the PDF to your desktop'}
        if((file.type!=='application/pdf')&&!err)   {err = 'Document must be a PDF'}
        
    
        /* If there is an error do not move on */
        if (err){
            document.getElementById('footer').innerHTML = err
            divDropZone.style.background = '#506e91' 
            return
        }
        let drawingType = document.getElementById('dropDrawingType').value
        await vmPart.part.addFile(file.path,drawingType)
        divDropZone.style.background = '#506e91'
        vmPart.part.getPart()

      

}

document.getElementById('descriptionSearch').onkeypress=(event)=>{
    let keyNotAllowed = event.key==';'||event.key=="'"
    if(keyNotAllowed){event.preventDefault()}
}
window.onload= ()=>{
    console.log('Page Loaded')
    loadScreen.style.display='none'
    setTimeout(()=>{
        console.log('timeout')
        vmSearch.$forceUpdate()
    },1000)
}


