import{X as b,$ as n,aa as p,_ as d,q as i,z as r,G as l,f as v,W as m}from"./vendor-Cm8GqOYV.js";import{a9 as g}from"./index-C7hIbkqs.js";import{a as u}from"./ant-design-DpoBeJk5.js";import"./microvideo-map-DtJOnaGT.js";const y={class:"api-docs-page"},f={class:"docs-container"},k={class:"docs-content"},S={id:"api-1",class:"api-section"},T={class:"api-block"},j={class:"code-block"},C={class:"api-block"},P={class:"code-tabs"},w={class:"code-block"},O={class:"code-block"},N={class:"code-block"},$={class:"postman-guide"},I={class:"code-block"},J={id:"api-2",class:"api-section"},q={class:"api-block"},x={class:"code-block"},E={class:"api-block"},K={class:"code-tabs"},A={class:"code-block"},B={class:"code-block"},D={class:"code-block"},H={class:"postman-guide"},h={class:"code-block"},U={id:"health",class:"api-section"},X={class:"api-block"},F={class:"code-block"},L={id:"usage-guide",class:"api-section"},R={class:"usage-method"},V={class:"code-block"},G={class:"usage-method"},W={class:"code-block"},z=`curl -X POST /api/component/generate-with-progress \\
  -H "Content-Type: application/json" \\
  -d '{
    "componentName": "c-my-component",
    "fileKey": "abc123def456",
    "nodeId": "123:456"
  }'`,M=`curl -X POST /api/generator/doc/generate-configs \\
  -H "Content-Type: application/json" \\
  -d '{
    "document": "# 组件需求\\n\\n## 微码组件设计\\n\\n### 页面元素\\n1. 按钮"
  }'`,Z=`const response = await fetch('/api/component/generate-with-progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    componentName: 'c-my-component',
    fileKey: 'abc123def456',
    nodeId: '123:456'
  })
})
const result = await response.json()`,Q=`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\n\\n## 微码组件设计'
  })
})
const result = await response.json()`,Y=`import requests

response = requests.post('/api/component/generate-with-progress',
  json={
    'componentName': 'c-my-component',
    'fileKey': 'abc123def456',
    'nodeId': '123:456'
  }
)
result = response.json()`,_=`import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\n\\n## 微码组件设计'
  }
)
result = response.json()`,tt=`{
  "componentName": "c-my-component",
  "fileKey": "abc123def456",
  "nodeId": "123:456"
}`,nt=`{
  "document": "# 组件需求\\n\\n## 微码组件设计\\n\\n### 页面元素\\n1. 按钮"
}`,st={__name:"ApiDocs",setup(ot){const a=v("curl"),e=v("curl"),o=async c=>{try{await navigator.clipboard.writeText(c),u.success("已复制到剪贴板")}catch{u.error("复制失败")}};return(c,t)=>(m(),b("div",y,[n("div",f,[t[68]||(t[68]=p('<aside class="docs-sidebar" data-v-073b6a4c><h3 data-v-073b6a4c>接口列表</h3><nav class="api-nav" data-v-073b6a4c><a href="#api-1" class="nav-item" data-v-073b6a4c>生成微码组件</a><a href="#api-2" class="nav-item" data-v-073b6a4c>生成文档配置</a><a href="#health" class="nav-item" data-v-073b6a4c>健康检查</a><a href="#usage-guide" class="nav-item" data-v-073b6a4c>调用方式说明</a></nav></aside>',1)),n("main",k,[n("section",S,[t[30]||(t[30]=n("h2",null,"生成微码组件",-1)),t[31]||(t[31]=n("div",{class:"api-badge"},"POST",-1)),t[32]||(t[32]=n("p",{class:"api-description"},"根据Figma设计稿生成微码组件代码",-1)),n("div",T,[t[22]||(t[22]=n("h3",null,"请求地址",-1)),n("div",j,[t[21]||(t[21]=n("code",null,"POST /api/component/generate-with-progress",-1)),n("button",{class:"btn-copy",onClick:t[0]||(t[0]=s=>o("/api/component/generate-with-progress"))}," 复制 ")])]),t[33]||(t[33]=p('<div class="api-block" data-v-073b6a4c><h3 data-v-073b6a4c>请求参数</h3><table class="param-table" data-v-073b6a4c><thead data-v-073b6a4c><tr data-v-073b6a4c><th data-v-073b6a4c>参数名</th><th data-v-073b6a4c>类型</th><th data-v-073b6a4c>必填</th><th data-v-073b6a4c>说明</th></tr></thead><tbody data-v-073b6a4c><tr data-v-073b6a4c><td data-v-073b6a4c><code data-v-073b6a4c>componentName</code></td><td data-v-073b6a4c>String</td><td data-v-073b6a4c>是</td><td data-v-073b6a4c>组件名称</td></tr><tr data-v-073b6a4c><td data-v-073b6a4c><code data-v-073b6a4c>fileKey</code></td><td data-v-073b6a4c>String</td><td data-v-073b6a4c>是</td><td data-v-073b6a4c>Figma文件Key</td></tr><tr data-v-073b6a4c><td data-v-073b6a4c><code data-v-073b6a4c>nodeId</code></td><td data-v-073b6a4c>String</td><td data-v-073b6a4c>是</td><td data-v-073b6a4c>Figma节点ID</td></tr><tr data-v-073b6a4c><td data-v-073b6a4c><code data-v-073b6a4c>figmaUrl</code></td><td data-v-073b6a4c>String</td><td data-v-073b6a4c>否</td><td data-v-073b6a4c>Figma URL（可选）</td></tr></tbody></table></div>',1)),n("div",C,[t[29]||(t[29]=n("h3",null,"请求示例",-1)),n("div",P,[n("button",{class:d(["tab-btn",{active:a.value==="curl"}]),onClick:t[1]||(t[1]=s=>a.value="curl")}," curl ",2),n("button",{class:d(["tab-btn",{active:a.value==="javascript"}]),onClick:t[2]||(t[2]=s=>a.value="javascript")}," JavaScript ",2),n("button",{class:d(["tab-btn",{active:a.value==="python"}]),onClick:t[3]||(t[3]=s=>a.value="python")}," Python ",2),n("button",{class:d(["tab-btn",{active:a.value==="postman"}]),onClick:t[4]||(t[4]=s=>a.value="postman")}," Postman ",2)]),i(n("div",w,[t[23]||(t[23]=n("pre",null,[n("code",null,`curl -X POST /api/component/generate-with-progress \\
  -H "Content-Type: application/json" \\
  -d '{
    "componentName": "c-my-component",
    "fileKey": "abc123def456",
    "nodeId": "123:456"
  }'`)],-1)),n("button",{class:"btn-copy",onClick:t[5]||(t[5]=s=>o(z))}," 复制 ")],512),[[r,a.value==="curl"]]),i(n("div",O,[t[24]||(t[24]=n("pre",null,[n("code",null,`const response = await fetch('/api/component/generate-with-progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    componentName: 'c-my-component',
    fileKey: 'abc123def456',
    nodeId: '123:456'
  })
})
const result = await response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[6]||(t[6]=s=>o(Z))}," 复制 ")],512),[[r,a.value==="javascript"]]),i(n("div",N,[t[25]||(t[25]=n("pre",null,[n("code",null,`import requests

response = requests.post('/api/component/generate-with-progress',
  json={
    'componentName': 'c-my-component',
    'fileKey': 'abc123def456',
    'nodeId': '123:456'
  }
)
result = response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[7]||(t[7]=s=>o(Y))}," 复制 ")],512),[[r,a.value==="python"]]),i(n("div",$,[t[27]||(t[27]=n("p",null,[n("strong",null,"Postman使用步骤：")],-1)),t[28]||(t[28]=n("ol",null,[n("li",null,"创建新的POST请求"),n("li",null,[l("输入URL: "),n("code",null,"/api/component/generate-with-progress")]),n("li",null,[l("在Headers中添加: "),n("code",null,"Content-Type: application/json")]),n("li",null,'在Body选项卡选择"raw"和"JSON"格式'),n("li",null,"输入JSON数据并发送")],-1)),n("div",I,[t[26]||(t[26]=n("pre",null,[n("code",null,`{
  "componentName": "c-my-component",
  "fileKey": "abc123def456",
  "nodeId": "123:456"
}`)],-1)),n("button",{class:"btn-copy",onClick:t[8]||(t[8]=s=>o(tt))}," 复制 ")])],512),[[r,a.value==="postman"]])]),t[34]||(t[34]=n("div",{class:"api-block"},[n("h3",null,"响应示例"),n("div",{class:"code-block"},[n("pre",null,[n("code",null,`{
  "success": true,
  "sessionId": "session-1234567890",
  "message": "组件生成已启动"
}`)])])],-1))]),n("section",J,[t[44]||(t[44]=n("h2",null,"生成文档配置",-1)),t[45]||(t[45]=n("div",{class:"api-badge"},"POST",-1)),t[46]||(t[46]=n("p",{class:"api-description"},"分析需求文档并生成四个配置章节",-1)),n("div",q,[t[36]||(t[36]=n("h3",null,"请求地址",-1)),n("div",x,[t[35]||(t[35]=n("code",null,"POST /api/generator/doc/generate-configs",-1)),n("button",{class:"btn-copy",onClick:t[9]||(t[9]=s=>o("/api/generator/doc/generate-configs"))}," 复制 ")])]),t[47]||(t[47]=p('<div class="api-block" data-v-073b6a4c><h3 data-v-073b6a4c>请求参数</h3><table class="param-table" data-v-073b6a4c><thead data-v-073b6a4c><tr data-v-073b6a4c><th data-v-073b6a4c>参数名</th><th data-v-073b6a4c>类型</th><th data-v-073b6a4c>必填</th><th data-v-073b6a4c>说明</th></tr></thead><tbody data-v-073b6a4c><tr data-v-073b6a4c><td data-v-073b6a4c><code data-v-073b6a4c>document</code></td><td data-v-073b6a4c>String</td><td data-v-073b6a4c>是</td><td data-v-073b6a4c>需求文档内容（Markdown格式）</td></tr></tbody></table></div>',1)),n("div",E,[t[43]||(t[43]=n("h3",null,"请求示例",-1)),n("div",K,[n("button",{class:d(["tab-btn",{active:e.value==="curl"}]),onClick:t[10]||(t[10]=s=>e.value="curl")}," curl ",2),n("button",{class:d(["tab-btn",{active:e.value==="javascript"}]),onClick:t[11]||(t[11]=s=>e.value="javascript")}," JavaScript ",2),n("button",{class:d(["tab-btn",{active:e.value==="python"}]),onClick:t[12]||(t[12]=s=>e.value="python")}," Python ",2),n("button",{class:d(["tab-btn",{active:e.value==="postman"}]),onClick:t[13]||(t[13]=s=>e.value="postman")}," Postman ",2)]),i(n("div",A,[t[37]||(t[37]=n("pre",null,[n("code",null,`curl -X POST /api/generator/doc/generate-configs \\
  -H "Content-Type: application/json" \\
  -d '{
    "document": "# 组件需求\\\\n\\\\n## 微码组件设计\\\\n\\\\n### 页面元素\\\\n1. 按钮"
  }'`)],-1)),n("button",{class:"btn-copy",onClick:t[14]||(t[14]=s=>o(M))}," 复制 ")],512),[[r,e.value==="curl"]]),i(n("div",B,[t[38]||(t[38]=n("pre",null,[n("code",null,`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\\\n\\\\n## 微码组件设计'
  })
})
const result = await response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[15]||(t[15]=s=>o(Q))}," 复制 ")],512),[[r,e.value==="javascript"]]),i(n("div",D,[t[39]||(t[39]=n("pre",null,[n("code",null,`import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\\\n\\\\n## 微码组件设计'
  }
)
result = response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[16]||(t[16]=s=>o(_))}," 复制 ")],512),[[r,e.value==="python"]]),i(n("div",H,[t[41]||(t[41]=n("p",null,[n("strong",null,"Postman使用步骤：")],-1)),t[42]||(t[42]=n("ol",null,[n("li",null,"创建新的POST请求"),n("li",null,[l("输入URL: "),n("code",null,"/api/generator/doc/generate-configs")]),n("li",null,[l("在Headers中添加: "),n("code",null,"Content-Type: application/json")]),n("li",null,'在Body选项卡选择"raw"和"JSON"格式'),n("li",null,"输入JSON数据并发送")],-1)),n("div",h,[t[40]||(t[40]=n("pre",null,[n("code",null,`{
  "document": "# 组件需求\\\\n\\\\n## 微码组件设计\\\\n\\\\n### 页面元素\\\\n1. 按钮"
}`)],-1)),n("button",{class:"btn-copy",onClick:t[17]||(t[17]=s=>o(nt))}," 复制 ")])],512),[[r,e.value==="postman"]])]),t[48]||(t[48]=n("div",{class:"api-block"},[n("h3",null,"响应示例"),n("div",{class:"code-block"},[n("pre",null,[n("code",null,`{
  "success": true,
  "merged": "完整的文档内容（包含配置）",
  "configs": {
    "businessEvents": "...",
    "businessStatuses": "...",
    "businessConfig": "...",
    "cssVariableConfig": "..."
  }
}`)])])],-1))]),n("section",U,[t[51]||(t[51]=n("h2",null,"健康检查",-1)),t[52]||(t[52]=n("div",{class:"api-badge get"},"GET",-1)),t[53]||(t[53]=n("p",{class:"api-description"},"检查服务器运行状态",-1)),n("div",X,[t[50]||(t[50]=n("h3",null,"请求地址",-1)),n("div",F,[t[49]||(t[49]=n("code",null,"GET /health",-1)),n("button",{class:"btn-copy",onClick:t[18]||(t[18]=s=>o("curl /health"))}," 复制 ")])]),t[54]||(t[54]=n("div",{class:"api-block"},[n("h3",null,"响应示例"),n("div",{class:"code-block"},[n("pre",null,[n("code",null,`{
  "status": "ok",
  "timestamp": "2026-07-02T04:12:03.472Z",
  "service": "langgraph-server"
}`)])])],-1))]),n("section",L,[t[65]||(t[65]=n("h2",null,"调用方式说明",-1)),t[66]||(t[66]=n("p",{class:"api-description"},"除了curl命令，还有多种方式调用API接口",-1)),n("div",R,[t[56]||(t[56]=n("h3",null,"JavaScript / TypeScript（前端）",-1)),t[57]||(t[57]=n("p",{class:"method-desc"},[n("strong",null,"使用场景："),l("在Web应用中调用API、构建用户界面时实时获取数据、用户触发操作时调用后端服务 ")],-1)),t[58]||(t[58]=n("p",{class:"method-desc"},[n("strong",null,"典型用例："),l('DocumentDesign.vue页面中的"生成配置"按钮、组件生成页（/generator/component）中的"开始生成组件"功能 ')],-1)),t[59]||(t[59]=n("p",{class:"method-desc"},[n("strong",null,"优势："),l("用户操作实时响应、可以展示加载状态和进度条、结果可以直接在页面显示 ")],-1)),n("div",V,[t[55]||(t[55]=n("pre",null,[n("code",null,`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\\\n\\\\n## 微码组件设计'
  })
})
const result = await response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[19]||(t[19]=s=>o(`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\\\n\\\\n## 微码组件设计'
  })
})
const result = await response.json()`))}," 复制 ")])]),n("div",G,[t[61]||(t[61]=n("h3",null,"Python",-1)),t[62]||(t[62]=n("p",{class:"method-desc"},[n("strong",null,"使用场景："),l("批量处理多个文档、自动化脚本和定时任务、数据分析和处理、集成到其他Python工具链 ")],-1)),t[63]||(t[63]=n("p",{class:"method-desc"},[n("strong",null,"典型用例："),l("批量生成100个组件的配置、结合pandas进行数据处理、定时任务自动生成文档 ")],-1)),t[64]||(t[64]=n("p",{class:"method-desc"},[n("strong",null,"优势："),l("适合批量操作、可以结合其他Python库、易于写自动化脚本 ")],-1)),n("div",W,[t[60]||(t[60]=n("pre",null,[n("code",null,`import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\\\n\\\\n## 微码组件设计'
  }
)
result = response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[20]||(t[20]=s=>o(`import requests

response = requests.post('/api/generator/doc/generate-configs', 
  json={
    'document': '# 组件需求\\\\n\\\\n## 微码组件设计'
  }
)
result = response.json()`))}," 复制 ")])]),t[67]||(t[67]=p('<div class="usage-method" data-v-073b6a4c><h3 data-v-073b6a4c>Postman / Insomnia</h3><p class="method-desc" data-v-073b6a4c><strong data-v-073b6a4c>使用场景：</strong>API调试和测试、开发阶段验证接口功能、学习和了解API用法、创建API文档和测试用例 </p><p class="method-desc" data-v-073b6a4c><strong data-v-073b6a4c>典型用例：</strong>测试新开发的API是否正常工作、验证参数格式是否正确、调试错误响应、团队共享API测试集合 </p><p class="method-desc" data-v-073b6a4c><strong data-v-073b6a4c>优势：</strong>图形界面操作直观、不需要写代码、可以保存请求历史、支持环境变量和测试脚本 </p><div class="guide-steps" data-v-073b6a4c><p data-v-073b6a4c><strong data-v-073b6a4c>使用步骤：</strong></p><ol data-v-073b6a4c><li data-v-073b6a4c>创建新的POST请求</li><li data-v-073b6a4c> 输入URL: <code data-v-073b6a4c>/api/generator/doc/generate-configs</code></li><li data-v-073b6a4c>在Body选项卡选择&quot;JSON&quot;格式</li><li data-v-073b6a4c>输入请求数据并发送</li></ol></div></div><div class="usage-summary" data-v-073b6a4c><h3 data-v-073b6a4c>选择建议</h3><ul data-v-073b6a4c><li data-v-073b6a4c><strong data-v-073b6a4c>开发Web应用</strong> → JavaScript/TypeScript</li><li data-v-073b6a4c><strong data-v-073b6a4c>批量处理/自动化</strong> → Python</li><li data-v-073b6a4c><strong data-v-073b6a4c>测试和调试</strong> → Postman/Insomnia</li></ul></div>',2))])])])]))}},it=g(st,[["__scopeId","data-v-073b6a4c"]]);export{it as default};
