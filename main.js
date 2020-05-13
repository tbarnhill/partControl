const {app, BrowserWindow,Menu, MenuItem, shell} = require('electron')

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
		{	
                accelerator: 'CmdOrCtrl+Z',
			    click: () => {
                    shell.openItem(app.getAppPath())
                    shell.openItem("I:\\Parts\\FMH\\FMH102\\FMH10223\\application\\")
                }
        }
        
    ];
    
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));


}



      
  
  

  

  
  