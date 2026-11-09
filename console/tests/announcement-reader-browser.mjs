import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const origin=process.env.ANNOUNCEMENTS_PREVIEW_URL||'http://127.0.0.1:5196';
const rows=[
 {id:1,title:'关于授予员工持股计划预留份额的公告',content:('公司公告正文：本次员工持股计划的授予条件、份额与实施安排如下。\n\n').repeat(18)},
 {id:2,title:'H股公告（截至2026年10月31日止股份发行人的证券变动月报表）',content:('本月证券变动情况说明。\n本公告包含股份变动与已发行股本的详细资料。\n\n').repeat(20)},
 {id:3,title:'关于经营数据披露及季度业绩情况的说明',content:'第三条公告正文。'},
].map(r=>({...r,stock_code:'300750',stock_name:'宁德时代',publish_date:'2026-11-03T11:44:10Z',source:'cninfo',source_url:'https://www.cninfo.com.cn/notice',content_metadata:{status:'complete'},analysis_status:'pending',is_read:false,is_starred:false,report:null}));
let failDetail=false,slowFirst=false;
await page.route('**/v1/**',async route=>{
 const req=route.request(),p=new URL(req.url()).pathname;
 const company={id:'c-a',name:'公告阅读测试',state:'running',token_usage_30d:0,dept_ids:['dept-investment']};let data={};
 if(p==='/v1/me')data={user:{id:'a',email:'test@example.test'},roles:['admin']};
 else if(p==='/v1/companies')data={items:[company]};
 else if(p==='/v1/companies/c-a')data=company;
 else if(p.endsWith('/depts'))data={items:[{id:'dept-investment',name:'股票投研部'}]};
 else if(p.endsWith('/research/department'))data={installation_status:'ready',can_install:false,capabilities:{can_submit:true,markets:{A:{can_submit:true,supported_depths:['quick']},US:{can_submit:true,supported_depths:['quick']}}}};
 else if(p.endsWith('/announcements/capabilities'))data={enabled:true,model_ready:false,collect_enabled:true,analyze_enabled:true,collect_interval_seconds:300};
 else if(p.endsWith('/announcements/watchlist'))data={items:[{stock_code:'300750',stock_name:'宁德时代',followed_at:'2026-11-09T00:00:00Z'}]};
 else if(p.endsWith('/research/announcements'))data={items:rows,total:rows.length,page:1,page_size:20};
 else if(/\/announcements\/\d+\/reports$/.test(p))data={items:[]};
 else if(/\/announcements\/\d+$/.test(p)){
  if(failDetail)return route.fulfill({status:500,contentType:'application/json',body:'{}'});
  if(slowFirst&&Number(p.split('/').at(-1))===1)await new Promise(resolve=>setTimeout(resolve,700));
  data=rows.find(r=>r.id===Number(p.split('/').at(-1)));
 }
 else if(p.endsWith('/tasks')||p.endsWith('/outputs/list'))data={items:[]};
 else if(p.endsWith('/personas')||p.endsWith('/conversations'))data=[];
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try{
 await page.goto(origin+'/console/?lang=zh#/business/c/c-a/chat?dept=dept-investment&page=announcements');
 await page.getByRole('button',{name:rows[0].title,exact:true}).click();
 const reader=page.getByRole('region',{name:'公告阅读区',exact:true});
 await reader.getByRole('heading',{name:rows[0].title,exact:true}).waitFor({timeout:5000});
 assert.equal(await reader.getByRole('tab',{name:'公告原文',exact:true}).getAttribute('aria-selected'),'true');
 await reader.getByText(/公司公告正文：/).waitFor();
 const listBox=await page.locator('.ann-index').boundingBox(),readerBox=await reader.boundingBox();
 assert.ok(listBox&&readerBox&&readerBox.x>listBox.x+listBox.width-2,'desktop reader sits beside list');
 await reader.getByRole('button',{name:'下一条公告',exact:true}).click();
 await reader.getByRole('heading',{name:rows[1].title,exact:true}).waitFor();
 await reader.getByRole('tab',{name:'分析报告',exact:true}).click();
 await reader.getByText('当前公告尚未生成分析报告，可先阅读公告原文。',{exact:true}).waitFor();
 await reader.getByRole('tab',{name:'公告原文',exact:true}).click();
 await page.screenshot({path:'/private/tmp/ann-reader-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.ann-index').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/private/tmp/ann-reader-mobile.png',fullPage:true});
 await reader.getByRole('button',{name:'返回公告列表',exact:true}).click();
 assert.equal(await page.locator('.ann-index').isVisible(),true);
 await page.waitForFunction(()=>document.activeElement?.id==='ann-open-2',{},{timeout:2000});
 failDetail=true;await page.getByRole('button',{name:rows[0].title,exact:true}).click();
 await reader.getByRole('button',{name:'重试加载',exact:true}).waitFor();
 await page.waitForFunction(()=>document.activeElement?.textContent==='重试加载',null,{timeout:2000});
 failDetail=false;await reader.getByRole('button',{name:'重试加载',exact:true}).click();
 await reader.getByRole('heading',{name:rows[0].title,exact:true}).waitFor();
 await reader.getByRole('button',{name:'返回公告列表',exact:true}).click();
 await page.setViewportSize({width:1440,height:1050});
 slowFirst=true;
 await page.getByRole('button',{name:rows[0].title,exact:true}).click();
 await page.getByRole('button',{name:rows[1].title,exact:true}).click();
 await reader.getByRole('heading',{name:rows[1].title,exact:true}).waitFor();
 await page.waitForTimeout(900);
 assert.equal(await reader.getByRole('heading',{name:rows[1].title,exact:true}).isVisible(),true,'late response must not replace current announcement');
 await page.getByRole('button',{name:rows[0].title,exact:true}).click();
 await reader.getByRole('button',{name:'返回公告列表',exact:true}).click();
 await page.waitForTimeout(900);
 assert.equal(await reader.count(),0,'late response must not reopen a closed reader');
 assert.deepEqual(errors,[]);
 console.log('PASS: split reader, original/report tabs, next announcement, mobile back/focus, retry and overflow.');
}catch(error){console.log('BODY',await page.locator('body').innerText(),'ERRORS',errors);throw error;}finally{await browser.close();}
