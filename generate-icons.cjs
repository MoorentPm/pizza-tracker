const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch();try{const page=await browser.newPage();const svg=fs.readFileSync('dist/icons/icon.svg','utf8');for(const [name,size]of [['icon-192',192],['icon-512',512],['icon-maskable',512],['apple-touch-icon',180]]){await page.setViewportSize({width:size,height:size});await page.setContent(`<style>html,body{margin:0;width:100%;height:100%}svg{width:100%;height:100%;display:block}</style>${svg}`);await page.screenshot({path:`dist/icons/${name}.png`});}}finally{await browser.close();}})();
