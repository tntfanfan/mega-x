"""Browser acceptance of real series components with intercepted project/media APIs.
Run Vite on :5197, then python console/tests/series-browser.py. No paid generation.
"""
import asyncio
import base64
import json
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.async_api import async_playwright, expect

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5d8AAAAASUVORK5CYII=')
ROOT = Path(__file__).resolve().parents[4]
POLICY = json.loads((ROOT/'platform/openclaw/plugins/src/shared/media-policy.json').read_text())
OUT = Path('/tmp/series-ui-acceptance')
OUT.mkdir(exist_ok=True)


def item(kind, logical, label, scope=None, metadata=None, **extra):
    ref = logical+'.v001.md@v1'
    return dict(kind=kind,logical=logical,label=label,scope=scope or {},latest=ref,latest_status='canonical',canonical=ref,stale=[],group='',metadata=metadata or {},**extra)


async def main():
    items=[item('profile','assets/characters/lin/profile','人物 林夏',{'asset_kind':'character','slug':'lin'},{'name':'林夏'}),
           item('script','story/ep-001/script-ep-001','第 1 集 剧本',{'episode':1}),
           item('storyboard','storyboards/ep-001/sh-001/storyboard-ep-001-sh-001','第 1 集 镜头 1',{'episode':1,'shot':1},{'representation':'text','duration_sec':5},summary='## 画面\n林夏站在门口。\n## 动作\n抬手敲门。'),
           item('storyboard','storyboards/ep-001/sh-002/storyboard-ep-001-sh-002','第 1 集 镜头 2',{'episode':1,'shot':2},{'representation':'mixed','duration_sec':5},thumb='media?path=board.png'),
           item('reference','references/research/notes','人物照片资料',metadata={'source_type':'research'},availability='available')]
    research=items[-1]['latest']
    refs=[dict(ref=research,file=f'references/research/media/{name}.png',project_id='demo',label=f'林夏{name}',kind='reference',status='draft',version=1,source_type='research',available=True,purpose='character',mime='image/png',url=f'media?path={name}.png',scope={}) for name in ('正面','侧面')]
    refs.append(dict(ref=items[3]['latest'],file='storyboards/board.png',project_id='demo',label='分镜图',kind='storyboard',status='canonical',version=1,source_type='storyboard',available=True,purpose='timing',mime='image/png',url='media?path=board.png',scope={'episode':1,'shot':2}))
    calls=[]; attempts={}; errors=[]; upload_requests=[]; delay_save=False
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True)
        page=await browser.new_page(viewport={'width':1440,'height':1000})
        # A public HTTP origin does not provide randomUUID; localhost normally does.
        await page.add_init_script("Object.defineProperty(crypto, 'randomUUID', {value: undefined})")
        page.on('pageerror',lambda e: errors.append(str(e)))
        async def route(request_route):
            req=request_route.request
            url=urlparse(req.url); path=url.path.removeprefix('/series-test-api'); query=parse_qs(url.query)
            data=req.post_data_json if req.headers.get('content-type','').startswith('application/json') else None
            calls.append((path,req.method,data))
            status=200; body={}
            if path=='/capabilities': body=POLICY
            elif path.endswith('/status'): body={'project_id':'other' if '/other/' in path else 'demo','title':'验收剧','items':items,'jobs':[]}
            elif path.endswith('/references'): body={'items':refs}
            elif path=='/media':
                await request_route.fulfill(status=200,body=PNG,content_type='image/png'); return
            elif path.endswith('/references/upload'):
                upload_requests.append(query)
                name=query['filename'][0]; attempts[name]=attempts.get(name,0)+1
                if name=='retry.md' and attempts[name]==1:
                    await request_route.fulfill(status=400,json={'detail':'临时上传失败，请重试'}); return
                if name=='slow.png': await asyncio.sleep(.5)
                n=len(items)+1; material=item('reference',f'references/materials/m-{n}/material',name,metadata={'name':name,'source_type':'upload','purpose':query.get('purpose',['style'])[0]},availability='available')
                material['canonical']=None; material['latest_status']='draft'; material['file']=f'references/materials/m-{n}/media/{name}'
                mime='text/markdown' if name.endswith('.md') else 'application/zip' if name.endswith('.zip') else 'image/png'
                material['metadata']['mime']=mime
                f=dict(ref=material['latest'],file=material['file'],project_id='demo',label=name,kind='reference',status='draft',version=1,source_type='upload',available=True,purpose=query.get('purpose',['style'])[0],mime=mime,url='media?path='+name,scope={})
                items.append(material); refs.append(f)
                body={'results':[{**f,'ok':True,'material_id':f'm-{n}'}]}
            elif path.endswith('/artifacts'):
                logical=query['logical'][0]; selected=next(i for i in items if i['logical']==logical)
                media=[dict(url=f['url'],mime=f['mime'],file=f['file']) for f in refs if f['ref']==selected['latest']]
                version={'ref':selected['latest'],'status':selected['latest_status'],'files':[selected['latest'].split('@')[0],*[m['file'] for m in media]],'depends_on':[],'media':media,'downstream':[],'metadata':selected['metadata'],'body':selected.get('summary','## 说明\n内容。'),'fields':'','editable':True}
                body={'project_id':'demo','logical':logical,'label':selected['label'],'versions':[version]}
            elif path.endswith('/video-inputs/preview') or path.endswith('/video-inputs'):
                if delay_save and path.endswith('/video-inputs'): await asyncio.sleep(.5)
                selection=data
                files=selection['references']; images=[f['file'] for f in files if f.get('file','').endswith('.png')]
                body={'storyboard':selection['storyboard'],'mode':'reference' if images else 't2v','text':'镜头文字','references':files,'payload':{'prompt':'本镜文字与动作要求','images':images,'videos':[],'audios':[],**selection['parameters']}}
                if path.endswith('/video-inputs'): body['request_id']='vi-'+str(len(calls)).zfill(32)
            else:
                status=404; body={'detail':path}
            try: await request_route.fulfill(status=status,json=body)
            except Exception:
                if not path.endswith('/references/upload'): raise
        await page.route('**/series-test-api/**',route)
        await page.goto('http://127.0.0.1:5197/console/tests/fixtures/series-ui.html')
        workspace=page.get_by_role('region',name='产出物')
        chat=page.get_by_role('region',name='对话')
        library=workspace.get_by_role('region',name='参考素材库')
        await workspace.get_by_text('项目参考素材',exact=True).wait_for()
        assert await chat.locator('input[type=file]').count()==0
        assert await chat.get_by_role('button',name='上传',exact=True).count()==0
        accept=(await library.locator('input[type=file]').get_attribute('accept')).split(',')
        assert set(accept)==set(POLICY['uploads']['extensions']) and '.zip' in accept and '.pdf' not in accept and '.mp3' not in accept
        await library.get_by_text('每次最多 10 个，合计 ≤200MB',exact=False).wait_for()
        async def drop_files(target, files):
            if await target.locator('input[type=file]').count():
                await expect(target.get_by_role('button',name='上传素材',exact=True)).to_be_enabled()
            # Browser preflight reads File metadata; oversized files need not allocate 200MB.
            dt=await page.evaluate_handle("""files => {
                const dt=new DataTransfer();
                for (const spec of files) {
                    const f=new File([new Uint8Array([137,80,78,71,13,10,26,10])],spec.name);
                    if (spec.size !== undefined) Object.defineProperty(f,'size',{value:spec.size});
                    dt.items.add(f);
                }
                return dt;
            }""",files)
            await target.dispatch_event('drop',{'dataTransfer':dt})
        await library.locator('input[type=file]').set_input_files([{'name':f'too-many-{i}.png','mimeType':'image/png','buffer':PNG} for i in range(11)])
        await library.get_by_role('alert').filter(has_text='每次最多上传 10 个文件').wait_for()
        for name in ('voice.mp3','document.pdf','program.exe'):
            await library.locator('input[type=file]').set_input_files({'name':name,'mimeType':'application/octet-stream','buffer':b'refused'})
            await library.get_by_role('alert').filter(has_text='仅支持图片、视频、TXT / Markdown 和 ZIP').wait_for()
        for name,category in [('big.png','image'),('big.mp4','video'),('big.txt','text'),('big.zip','archive')]:
            await drop_files(library,[{'name':name,'size':POLICY['uploads']['maxBytes'][category]+1}])
            await library.get_by_role('alert').filter(has_text=f'{name}：单个文件不能超过').wait_for()
        await drop_files(library,[{'name':f'clip-{i}.mp4','size':70*1048576} for i in range(3)])
        await library.get_by_role('alert').filter(has_text='合计不能超过 200MB').wait_for()
        assert not upload_requests, 'invalid batches must be rejected before uploading'
        await workspace.locator('input[type=file]').set_input_files([{'name':'portrait.png','mimeType':'image/png','buffer':PNG},{'name':'retry.md','mimeType':'text/markdown','buffer':'文字资料'.encode()}])
        await workspace.get_by_text('临时上传失败，请重试',exact=True).wait_for()
        await workspace.get_by_role('button',name='重试 retry.md',exact=True).click()
        await page.wait_for_function("document.querySelector('[aria-label=产出物]').textContent.split('已存入项目').length >= 3")
        assert len({r['batch_id'][0] for r in upload_requests})==1
        retried=[r for r in upload_requests if r['filename'][0]=='retry.md']
        assert len(retried)==2 and retried[0]['request_id']==retried[1]['request_id']
        await library.locator('input[type=file]').set_input_files({'name':'bundle.zip','mimeType':'application/zip','buffer':b'PK\x05\x06'+b'\0'*18})
        await library.get_by_text('ZIP 素材包',exact=True).wait_for()
        await workspace.locator('li').filter(has=page.get_by_text('portrait.png',exact=True)).get_by_role('button',name='加入对话',exact=True).click()
        assert await chat.get_by_role('button',name='移除引用 portrait.png',exact=True).count()==1
        await workspace.get_by_role('button',name='人物照片资料',exact=False).first.click()
        await workspace.get_by_role('button',name='加入对话',exact=True).nth(0).click()
        await workspace.get_by_role('button',name='加入对话',exact=True).nth(1).click()
        assert await chat.get_by_role('button',name='移除引用',exact=False).count()==3, 'two attachments must not deduplicate'
        before=len(upload_requests)
        await drop_files(chat,[{'name':'chat-drop.png'}])
        await page.wait_for_timeout(100)
        assert len(upload_requests)==before and await chat.get_by_role('button',name='移除引用 chat-drop.png',exact=True).count()==0
        await workspace.get_by_role('button',name='参考素材',exact=False).first.click()
        await drop_files(library,[{'name':'drop.png'}])
        await library.locator('li').filter(has=page.get_by_text('drop.png',exact=True)).get_by_role('button',name='加入对话',exact=True).click()
        await chat.get_by_role('button',name='移除引用 drop.png',exact=True).wait_for()
        await page.screenshot(path=str(OUT/'references-and-chat.png'))
        await workspace.get_by_role('button',name='资产',exact=False).first.click()
        await workspace.get_by_role('button',name='查看 人物 林夏',exact=True).first.click()
        await workspace.get_by_role('button',name='生成概念图',exact=True).click()
        dialog=page.get_by_role('dialog')
        assert await dialog.locator('input[type=file]').count()==0
        await dialog.get_by_role('checkbox',name='脸部特写 正面脸部',exact=True).check()
        await dialog.get_by_role('checkbox',name='全身 正面全身',exact=True).check()
        await dialog.get_by_role('button',name='生成 3 张概念图',exact=True).wait_for()
        await page.screenshot(path=str(OUT/'concept-settings.png'))
        await dialog.get_by_role('button',name='生成 3 张概念图',exact=True).click()
        sent=json.loads(await page.get_by_test_id('sent').text_content())
        assert 'three-view' in sent['text'] and 'face-closeup' in sent['text'] and 'full-body' in sent['text']
        await workspace.get_by_role('button',name='分镜',exact=False).first.click()
        await workspace.get_by_role('button',name='查看 第 1 集 镜头 1',exact=True).first.click()
        await workspace.get_by_role('button',name='选择参考并生成视频',exact=True).click()
        dialog=page.get_by_role('dialog')
        await dialog.get_by_role('button',name='自定义组合',exact=False).click()
        await dialog.get_by_label('林夏正面',exact=False).check()
        await dialog.get_by_label('林夏侧面',exact=False).check()
        await dialog.get_by_label('参考 1 资产绑定',exact=True).select_option('character:lin')
        await dialog.get_by_label('参考 2 资产绑定',exact=True).select_option('character:lin')
        await dialog.get_by_role('button',name='上移参考 2',exact=True).click()
        await dialog.get_by_role('button',name='下一步：核对实际输入',exact=True).click()
        await dialog.get_by_text('请核对本次实际输入',exact=True).wait_for()
        latest=next(x[2] for x in reversed(calls) if x[0].endswith('/preview'))
        assert [r['file'] for r in latest['references']]==[refs[1]['file'],refs[0]['file']]
        assert all(r['asset_binding']['slug']=='lin' for r in latest['references'])
        await page.screenshot(path=str(OUT/'video-review.png'))
        await dialog.get_by_role('button',name='返回调整',exact=True).click()
        await dialog.get_by_role('button',name='只用分镜文字',exact=False).click()
        await dialog.get_by_role('button',name='下一步：核对实际输入',exact=True).click()
        await dialog.get_by_text('仅使用文字，没有视觉参考。',exact=True).wait_for()
        latest=next(x[2] for x in reversed(calls) if x[0].endswith('/preview'))
        assert latest['references']==[]
        await dialog.get_by_role('button',name='确认生成 1 个镜头',exact=True).click()
        await page.wait_for_function("document.querySelector('[data-testid=sent]').textContent.includes('ids')")
        sent_before=await page.get_by_test_id('sent').text_content()
        await workspace.get_by_role('button',name='选择参考并生成视频',exact=True).click()
        dialog=page.get_by_role('dialog')
        await dialog.get_by_role('button',name='下一步：核对实际输入',exact=True).click()
        await dialog.get_by_text('请核对本次实际输入',exact=True).wait_for()
        delay_save=True
        await dialog.get_by_role('button',name='确认生成 1 个镜头',exact=True).click()
        await page.keyboard.press('Escape')
        await page.wait_for_timeout(700)
        assert await page.get_by_test_id('sent').text_content()==sent_before,'closing while saving must not send generation'
        delay_save=False
        await workspace.get_by_role('button',name='参考素材',exact=False).first.click()
        await drop_files(library,[{'name':'slow.png'}])
        await library.get_by_role('button',name='取消上传 slow.png',exact=True).wait_for()
        await page.get_by_role('button',name='切换测试项目',exact=True).click()
        await page.wait_for_timeout(800)
        assert await library.locator('[aria-live=polite]').inner_text()==''
        await page.set_viewport_size({'width':390,'height':844})
        await workspace.get_by_role('button',name='分镜',exact=False).first.click()
        await workspace.get_by_role('button',name='规划分镜',exact=True).click()
        await page.screenshot(path=str(OUT/'mobile-storyboard-settings.png'))
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile horizontal overflow'
        await page.keyboard.press('Escape')
        assert await page.get_by_role('dialog').count()==0
        assert not errors,errors
        print(json.dumps({'passed':['no chat upload or file drop','reference-only upload','type/count/file-size/batch-size limits','ZIP upload','HTTP upload retry with stable batch and request IDs','file-level references','reference library file drop','concept layout multiselect','ordered photos and role bindings','text-only clears visuals','snapshot submission','cancel during save does not generate','project switch isolation','mobile dialog and Escape'], 'screenshots':str(OUT),'requests':len(calls)},ensure_ascii=False))
        await browser.close()

async def empty_project():
    """Start the actual SeriesApp with no project, as a newly created company does."""
    project=None; material=None; created=[]; errors=[]
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(headless=True)
        page=await browser.new_page(viewport={'width':1440,'height':1000})
        page.on('pageerror',lambda e: errors.append(str(e)))
        async def route(r):
            nonlocal project,material
            req=r.request; url=urlparse(req.url); path=url.path.removeprefix('/series-test-api')
            session={'id':'s-empty','title':'新对话','project_id':project['project_id'] if project else None}
            if path=='/sessions': body={'sessions':[session]}
            elif path.endswith('/history'): body={'session':session,'messages':[],'live':None,'project_id':session['project_id']}
            elif path=='/capabilities': body=POLICY
            elif path=='/projects': body={'projects':[project] if project else []}
            elif path=='/sessions/s-empty/project' and req.method=='POST':
                created.append(req.post_data_json)
                project={'project_id':'new-series','title':req.post_data_json['title']}; body=project
            elif path.endswith('/status'): body={**project,'items':[material] if material else [],'jobs':[]}
            elif path.endswith('/events'):
                await r.fulfill(status=200,body=': ready\n\n',content_type='text/event-stream'); return
            elif path.endswith('/references/upload'):
                name=parse_qs(url.query)['filename'][0]
                material=item('reference','references/materials/m-one/material',name,metadata={'source_type':'upload','material_id':'m-one','name':name,'mime':'text/plain'},availability='available',file='references/materials/m-one/media/reference.txt')
                body={'results':[{'ok':True,'ref':material['latest'],'file':material['file'],'project_id':project['project_id'],'label':name,'material_id':'m-one','mime':'text/plain','url':'media?path=reference.txt'}]}
            elif path.endswith('/artifacts'):
                body={'project_id':project['project_id'],'logical':material['logical'],'label':material['label'],'versions':[{'ref':material['latest'],'status':'draft','files':[material['file']],'depends_on':[],'downstream':[],'metadata':material['metadata'],'body':'参考说明','fields':'','media':[{'url':'media?path=reference.txt','mime':'text/plain','file':material['file']}]}]}
            else:
                await r.fulfill(status=404,json={'detail':path}); return
            await r.fulfill(status=200,json=body)
        await page.route('**/series-test-api/**',route)
        await page.route_web_socket('**/series-test-api/chat*',lambda ws: ws.send(json.dumps({'type':'ready'})))
        await page.goto('http://127.0.0.1:5197/console/tests/fixtures/series-app.html')
        workspace=page.get_by_role('region',name='产出物')
        await workspace.get_by_role('button',name='参考素材',exact=True).click()
        library=workspace.get_by_role('region',name='参考素材库')
        await expect(library.get_by_role('button',name='上传素材',exact=True)).to_be_enabled()
        await page.screenshot(path=str(OUT/'reference-empty-project.png'))
        await page.set_viewport_size({'width':390,'height':844})
        await page.get_by_role('button',name='产出物',exact=True).click()
        await library.get_by_role('button',name='上传素材',exact=True).click()
        await library.get_by_label('项目名称',exact=True).fill('第一部剧')
        await library.get_by_role('button',name='创建项目，继续上传',exact=True).click()
        await expect(library.locator('input[type=file]')).to_have_count(1)
        await expect(library.get_by_role('button',name='上传素材',exact=True)).to_be_enabled()
        assert created==[{'title':'第一部剧'}]
        async with page.expect_file_chooser() as chooser:
            await library.get_by_role('button',name='上传素材',exact=True).click()
        await (await chooser.value).set_files({'name':'reference.txt','mimeType':'text/plain','buffer':'第一份参考素材'.encode()})
        await library.get_by_text('已存入项目',exact=True).wait_for()
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'mobile upload overflow'
        await page.screenshot(path=str(OUT/'reference-first-upload-mobile.png'))
        await page.set_viewport_size({'width':1440,'height':1000})
        await library.locator('li').get_by_role('button',name='reference.txt',exact=False).click()
        await expect(library.get_by_role('button',name='上传素材',exact=True)).to_be_visible()
        await library.get_by_role('button',name='全部参考素材',exact=True).click()
        await page.screenshot(path=str(OUT/'reference-first-upload.png'))
        assert await page.get_by_role('region',name='对话').locator('input[type=file]').count()==0
        assert not errors,errors
        print(json.dumps({'passed':['empty company upload entry','create first project without chat','stay in references after creation','upload button opens file chooser','upload stays visible in material details']},ensure_ascii=False))
        await browser.close()


asyncio.run(empty_project())
asyncio.run(main())
