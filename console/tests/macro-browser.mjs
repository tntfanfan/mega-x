import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
let jobs=[];
const sw=[{'指数代码':'801001','指数名称':'申万50','发布日期':'2026-11-06','收盘指数':1234,'市净率':1.4}];
await page.route('**/v1/**',async route=>{
 const req=route.request(),u=new URL(req.url()),p=u.pathname,method=req.method();calls.push([method,p,u.search,req.postData()]);let data={};
 const company={id:'c-a',name:'宏观数据测试公司',state:'running',dept_ids:['dept-investment'],token_usage_30d:0};
 if(p==='/v1/me')data={user:{id:'a',email:'test@example.test',display_name:'Test'},roles:['admin']};
 else if(p==='/v1/companies')data={items:[company]};
 else if(p==='/v1/companies/c-a')data=company;
 else if(p.endsWith('/depts'))data={items:[{id:'dept-investment',name:'股票投研部',emoji:'📈'}]};
 else if(p.endsWith('/research/department'))data={installation_status:'ready',can_install:false,capabilities:{can_submit:true,markets:{A:{can_submit:true,supported_depths:['quick']},US:{can_submit:true,supported_depths:['quick']}}}};
 else if(p.endsWith('/research/dialogue/capabilities'))data={can_send:false};
 else if(p.endsWith('/research/dialogue/personas')||p.endsWith('/research/dialogue/conversations'))data=[];
 else if(p.endsWith('/macro/catalog'))data={items:sw,fields:['收盘指数','市净率']};
 else if(p.endsWith('/macro/sw'))data={items:sw,total:1};
 else if(p.endsWith('/macro/compare'))data={field:'市净率',dates:['2026-10-30','2026-11-06'],series:[{name:'申万50',data:[1.2,1.4]}]};
 else if(p.endsWith('/macro/shareholders'))data={items:[{stock_code:'000001',stock_name:'平安银行','公告日期':'2026-11-06','股东户数':100,'股东户数较上期变化':-10}],total:1,page:1,page_count:1,summary:{sample_count:1,counts:{increase:0,decrease:1,unchanged:0,unknown:0},earliest_date:'2026-11-06',latest_date:'2026-11-06'}};
 else if(p.endsWith('/macro/jobs')&&method==='POST'){data={id:'j1',kind:req.postDataJSON().kind,status:'running',cancel:0,error:null,progress:{current:1,total:2,records:1,errors:0}};jobs=[data];}
 else if(p.endsWith('/macro/jobs'))data={items:jobs};
 else if(p.endsWith('/macro/jobs/j1/stop')){jobs=jobs.map(j=>({...j,status:'stopped',cancel:1}));data={ok:true};}
 else if(p.endsWith('/tasks')||p.endsWith('/outputs/list'))data={items:[]};
 else if(p.endsWith('/workspace/status'))data={status:'ready',ready:true};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try{
 await page.goto((process.env.MACRO_PREVIEW_URL||'http://127.0.0.1:5198')+'/console/?lang=zh#/business/c/c-a/chat?dept=dept-investment&page=macro');
 await page.getByRole('button',{name:'股东户数',exact:true}).waitFor({timeout:20000});
 await page.getByLabel('指数',{exact:true}).selectOption('801001');
 await page.getByRole('button',{name:'查询',exact:true}).click();
 await page.getByRole('img',{name:'指数走势与对比'}).waitFor();
 await page.getByText('数据采集与任务状态',{exact:true}).click();
 await page.getByLabel('采集范围').selectOption('recent');
 await page.getByRole('spinbutton',{name:'周数'}).fill('52');
 await page.getByRole('button',{name:'开始采集',exact:true}).click();
 await page.getByRole('button',{name:'停止',exact:true}).click();
 await page.getByText(/已停止/).waitFor();
 await page.screenshot({path:'/private/tmp/macro-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'股东户数',exact:true}).click();
 await page.getByText('平安银行',{exact:true}).waitFor();
 await page.getByRole('combobox',{name:'视图',exact:true}).selectOption('history');
 await page.getByRole('textbox',{name:'股票代码',exact:true}).last().fill('000001');
 await page.getByRole('button',{name:'查询',exact:true}).click();
 await page.getByRole('img',{name:'股东户数趋势（当前页）'}).waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('img',{name:'股东户数趋势（当前页）'}).evaluate(el=>el.scrollIntoView({block:'center'}));
 await page.screenshot({path:'/private/tmp/macro-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'no document overflow');
 assert.ok(calls.some(([method,p,,body])=>method==='POST'&&p.endsWith('/macro/jobs')&&JSON.parse(body).weeks===52));
 assert.deepEqual(errors,[]);
 console.log('PASS: macro navigation, index history chart, recent-week collection, status/stop, shareholder history/distribution, mobile layout; no page errors');
} catch(e){console.log('BODY',await page.locator('body').innerText(),'ERRORS',errors);throw e;}finally{await browser.close();}
