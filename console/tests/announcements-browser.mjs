import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ANNOUNCEMENTS_PREVIEW_URL||'http://127.0.0.1:5196';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let follows=[],starred=false;
const calls=[];
const row={id:1,stock_code:'000001',stock_name:'平安银行',title:'测试公告：经营数据披露',publish_date:'2026-11-03T06:00:00Z',source:'cninfo',source_url:'https://www.cninfo.com.cn',content:'公开公告正文。',content_metadata:{status:'complete'},analysis_status:'completed',is_read:false,is_starred:false,report:{id:1,announcement_id:1,impact_type:'中性',impact_score:0,impact_summary:'没有新增影响',report:'这是公开公告分析报告。',created_at:'2026-11-03T06:01:00Z',model_used:'fixture'}};
await page.route('**/v1/**',async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname,method=req.method();calls.push([method,p]);let data={};
 const company={id:'c-a',name:'公告测试公司',state:'running',dept_ids:['dept-investment'],token_usage_30d:0};
 if(p==='/v1/me')data={user:{id:'a',email:'test@example.test',display_name:'Test'},roles:['admin']};
 else if(p==='/v1/companies')data={items:[company]};
 else if(p==='/v1/companies/c-a')data=company;
 else if(p.endsWith('/research/department'))data={installation_status:'ready',can_install:false,capabilities:{can_submit:true,markets:{A:{can_submit:true,supported_depths:['quick']},US:{can_submit:true,supported_depths:['quick']}}}};
 else if(p.endsWith('/research/dialogue/capabilities'))data={can_send:false};
 else if(p.endsWith('/research/dialogue/personas'))data=[];
 else if(p.endsWith('/research/dialogue/conversations'))data=[];
 else if(p.endsWith('/announcements/capabilities'))data={enabled:true,model_ready:true,collect_enabled:true,analyze_enabled:true};
 else if(p.endsWith('/announcements/watchlist')&&method==='POST'){follows=[{stock_code:req.postDataJSON().stock_code,followed_at:new Date().toISOString()}];data=follows[0];}
 else if(p.includes('/announcements/watchlist/')&&method==='DELETE'){follows=[];}
 else if(p.endsWith('/announcements/watchlist'))data={items:follows};
 else if(p.endsWith('/announcements/1/state')){starred=req.postDataJSON().is_starred??starred;data={is_starred:starred,is_read:true};}
 else if(p.endsWith('/announcements/1/reports'))data={items:[row.report],total:1};
 else if(p.endsWith('/announcements/1'))data={...row,is_starred:starred};
 else if(p.endsWith('/research/announcements'))data={items:follows.length?[{...row,is_starred:starred}]:[],total:follows.length,page:1,page_size:20};
 else if(p==='/v1/admin/announcements/controls')data={collect_enabled:true,analyze_enabled:true,model_ready:true};
 else if(p==='/v1/admin/announcements/jobs')data={items:[]};
 else if(p==='/v1/admin/announcements/collect'||p==='/v1/admin/announcements/analyze')data={job_ids:[]};
 else if(p.endsWith('/tasks')||p.endsWith('/outputs/list'))data={items:[]};
 else if(p.endsWith('/workspace/status'))data={status:'ready',ready:true};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
await page.goto(origin+'/console/?lang=zh#/business/c/c-a/research/announcements');
try{await page.getByText('添加第一只关注股票，开始监测公告。').waitFor({timeout:20000});}catch(e){console.log('URL',page.url(),'BODY',await page.locator('body').innerText(),'CALLS',calls,'ERRORS',errors);await page.screenshot({path:'/private/tmp/ann-browser-failure.png',fullPage:true});await browser.close();throw e;}
await page.getByLabel('A股代码').fill('000001');await page.getByRole('button',{name:'添加关注',exact:true}).click();
await page.getByRole('button',{name:row.title,exact:true}).click();
await page.getByText('这是公开公告分析报告。',{exact:true}).waitFor();
await page.getByRole('button',{name:'收藏 '+row.title,exact:true}).click();
await page.getByRole('button',{name:'取消收藏 '+row.title,exact:true}).waitFor();
await page.screenshot({path:'/private/tmp/ann-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/ann-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no horizontal overflow');
await page.getByRole('button',{name:'取消关注 000001',exact:true}).click();
await page.getByText('添加第一只关注股票，开始监测公告。').waitFor();
await page.goto(origin+'/console/?lang=en#/admin/announcements');
await page.getByRole('button',{name:'Collect followed stocks',exact:true}).click();
await page.getByText('No followed stocks or announcements need processing.',{exact:true}).waitFor();
assert.ok(calls.some(([m,p])=>m==='POST'&&p.endsWith('/admin/announcements/collect')));
assert.deepEqual(errors,[]);
console.log('PASS: watch, shared report, zero score, star, unfollow, admin trigger, mobile layout; no page errors');
await browser.close();
