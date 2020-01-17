const {app, BrowserWindow,Menu, MenuItem} = require('electron')

app.on('ready', createWindow)

function createWindow () {
    let win = new BrowserWindow({ width: 1000, height: 1000, icon:'icon.ico', autoHideMenuBar: true} )
    win.loadFile('update.html')
    win.on('closed', () => {win = null})
    app.on('window-all-closed', () => { app.quit()})
	
	 const menuTemplate = [
        {
			    accelerator: 'CmdOrCtrl+D',
			    click: () => {win.webContents.openDevTools()}
        },
		    {	
			    accelerator: 'CmdOrCtrl+R',
			    click: () => {win.loadFile('update.html')}
        },
        
    ];
    
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));


}



      
  
  

  

  
  