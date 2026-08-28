import{X as f,k as m,$ as n,aa as p,_ as l,q as i,z as r,G as d,f as u,W as g}from"./vendor-BvGxCj3d.js";import{a9 as b,aa as y}from"./index-Duo5GCfW.js";import{a as c}from"./ant-design-BSdyHz_d.js";import"./microvideo-map-C3iSxrVm.js";const k={class:"api-docs-page"},S={class:"docs-container"},T={class:"docs-content"},j={id:"api-1",class:"api-section"},C={class:"api-block"},P={class:"code-block"},w={class:"api-block"},O={class:"code-tabs"},N={class:"code-block"},$={class:"code-block"},I={class:"code-block"},J={class:"postman-guide"},q={class:"code-block"},x={id:"api-2",class:"api-section"},A={class:"api-block"},E={class:"code-block"},K={class:"api-block"},H={class:"code-tabs"},B={class:"code-block"},D={class:"code-block"},h={class:"code-block"},U={class:"postman-guide"},V={class:"code-block"},X={id:"health",class:"api-section"},F={class:"api-block"},L={class:"code-block"},R={id:"usage-guide",class:"api-section"},G={class:"usage-method"},W={class:"code-block"},z={class:"usage-method"},M={class:"code-block"},Z=`curl -X POST /api/component/generate-with-progress \\
  -H "Content-Type: application/json" \\
  -d '{
    "componentName": "c-my-component",
    "fileKey": "abc123def456",
    "nodeId": "123:456"
  }'`,Q=`curl -X POST /api/generator/doc/generate-configs \\
  -H "Content-Type: application/json" \\
  -d '{
    "document": "# 组件需求\\n\\n## 微码组件设计\\n\\n### 页面元素\\n1. 按钮"
  }'`,Y=`const response = await fetch('/api/component/generate-with-progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    componentName: 'c-my-component',
    fileKey: 'abc123def456',
    nodeId: '123:456'
  })
})
const result = await response.json()`,_=`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\n\\n## 微码组件设计'
  })
})
const result = await response.json()`,tt=`import requests

response = requests.post('/api/component/generate-with-progress',
  json={
    'componentName': 'c-my-component',
    'fileKey': 'abc123def456',
    'nodeId': '123:456'
  }
)
result = response.json()`,nt=`import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\n\\n## 微码组件设计'
  }
)
result = response.json()`,et=`{
  "componentName": "c-my-component",
  "fileKey": "abc123def456",
  "nodeId": "123:456"
}`,st=`{
  "document": "# 组件需求\\n\\n## 微码组件设计\\n\\n### 页面元素\\n1. 按钮"
}`,ot={__name:"ApiDocs",setup(at){const o=u("curl"),a=u("curl"),s=async v=>{try{await navigator.clipboard.writeText(v),c.success("已复制到剪贴板")}catch{c.error("复制失败")}};return(v,t)=>(g(),f("div",k,[m(y),n("div",S,[t[68]||(t[68]=p('<aside class="docs-sidebar" data-v-f27ead41><h3 data-v-f27ead41>接口列表</h3><nav class="api-nav" data-v-f27ead41><a href="#api-1" class="nav-item" data-v-f27ead41>生成微码组件</a><a href="#api-2" class="nav-item" data-v-f27ead41>生成文档配置</a><a href="#health" class="nav-item" data-v-f27ead41>健康检查</a><a href="#usage-guide" class="nav-item" data-v-f27ead41>调用方式说明</a></nav></aside>',1)),n("main",T,[n("section",j,[t[30]||(t[30]=n("h2",null,"生成微码组件",-1)),t[31]||(t[31]=n("div",{class:"api-badge"},"POST",-1)),t[32]||(t[32]=n("p",{class:"api-description"},"根据Figma设计稿生成微码组件代码",-1)),n("div",C,[t[22]||(t[22]=n("h3",null,"请求地址",-1)),n("div",P,[t[21]||(t[21]=n("code",null,"POST /api/component/generate-with-progress",-1)),n("button",{class:"btn-copy",onClick:t[0]||(t[0]=e=>s("/api/component/generate-with-progress"))}," 复制 ")])]),t[33]||(t[33]=p('<div class="api-block" data-v-f27ead41><h3 data-v-f27ead41>请求参数</h3><table class="param-table" data-v-f27ead41><thead data-v-f27ead41><tr data-v-f27ead41><th data-v-f27ead41>参数名</th><th data-v-f27ead41>类型</th><th data-v-f27ead41>必填</th><th data-v-f27ead41>说明</th></tr></thead><tbody data-v-f27ead41><tr data-v-f27ead41><td data-v-f27ead41><code data-v-f27ead41>componentName</code></td><td data-v-f27ead41>String</td><td data-v-f27ead41>是</td><td data-v-f27ead41>组件名称</td></tr><tr data-v-f27ead41><td data-v-f27ead41><code data-v-f27ead41>fileKey</code></td><td data-v-f27ead41>String</td><td data-v-f27ead41>是</td><td data-v-f27ead41>Figma文件Key</td></tr><tr data-v-f27ead41><td data-v-f27ead41><code data-v-f27ead41>nodeId</code></td><td data-v-f27ead41>String</td><td data-v-f27ead41>是</td><td data-v-f27ead41>Figma节点ID</td></tr><tr data-v-f27ead41><td data-v-f27ead41><code data-v-f27ead41>figmaUrl</code></td><td data-v-f27ead41>String</td><td data-v-f27ead41>否</td><td data-v-f27ead41>Figma URL（可选）</td></tr></tbody></table></div>',1)),n("div",w,[t[29]||(t[29]=n("h3",null,"请求示例",-1)),n("div",O,[n("button",{class:l(["tab-btn",{active:o.value==="curl"}]),onClick:t[1]||(t[1]=e=>o.value="curl")}," curl ",2),n("button",{class:l(["tab-btn",{active:o.value==="javascript"}]),onClick:t[2]||(t[2]=e=>o.value="javascript")}," JavaScript ",2),n("button",{class:l(["tab-btn",{active:o.value==="python"}]),onClick:t[3]||(t[3]=e=>o.value="python")}," Python ",2),n("button",{class:l(["tab-btn",{active:o.value==="postman"}]),onClick:t[4]||(t[4]=e=>o.value="postman")}," Postman ",2)]),i(n("div",N,[t[23]||(t[23]=n("pre",null,[n("code",null,`curl -X POST /api/component/generate-with-progress \\
  -H "Content-Type: application/json" \\
  -d '{
    "componentName": "c-my-component",
    "fileKey": "abc123def456",
    "nodeId": "123:456"
  }'`)],-1)),n("button",{class:"btn-copy",onClick:t[5]||(t[5]=e=>s(Z))}," 复制 ")],512),[[r,o.value==="curl"]]),i(n("div",$,[t[24]||(t[24]=n("pre",null,[n("code",null,`const response = await fetch('/api/component/generate-with-progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    componentName: 'c-my-component',
    fileKey: 'abc123def456',
    nodeId: '123:456'
  })
})
const result = await response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[6]||(t[6]=e=>s(Y))}," 复制 ")],512),[[r,o.value==="javascript"]]),i(n("div",I,[t[25]||(t[25]=n("pre",null,[n("code",null,`import requests

response = requests.post('/api/component/generate-with-progress',
  json={
    'componentName': 'c-my-component',
    'fileKey': 'abc123def456',
    'nodeId': '123:456'
  }
)
result = response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[7]||(t[7]=e=>s(tt))}," 复制 ")],512),[[r,o.value==="python"]]),i(n("div",J,[t[27]||(t[27]=n("p",null,[n("strong",null,"Postman使用步骤：")],-1)),t[28]||(t[28]=n("ol",null,[n("li",null,"创建新的POST请求"),n("li",null,[d("输入URL: "),n("code",null,"/api/component/generate-with-progress")]),n("li",null,[d("在Headers中添加: "),n("code",null,"Content-Type: application/json")]),n("li",null,'在Body选项卡选择"raw"和"JSON"格式'),n("li",null,"输入JSON数据并发送")],-1)),n("div",q,[t[26]||(t[26]=n("pre",null,[n("code",null,`{
  "componentName": "c-my-component",
  "fileKey": "abc123def456",
  "nodeId": "123:456"
}`)],-1)),n("button",{class:"btn-copy",onClick:t[8]||(t[8]=e=>s(et))}," 复制 ")])],512),[[r,o.value==="postman"]])]),t[34]||(t[34]=n("div",{class:"api-block"},[n("h3",null,"响应示例"),n("div",{class:"code-block"},[n("pre",null,[n("code",null,`{
  "success": true,
  "sessionId": "session-1234567890",
  "message": "组件生成已启动"
}`)])])],-1))]),n("section",x,[t[44]||(t[44]=n("h2",null,"生成文档配置",-1)),t[45]||(t[45]=n("div",{class:"api-badge"},"POST",-1)),t[46]||(t[46]=n("p",{class:"api-description"},"分析需求文档并生成四个配置章节",-1)),n("div",A,[t[36]||(t[36]=n("h3",null,"请求地址",-1)),n("div",E,[t[35]||(t[35]=n("code",null,"POST /api/generator/doc/generate-configs",-1)),n("button",{class:"btn-copy",onClick:t[9]||(t[9]=e=>s("/api/generator/doc/generate-configs"))}," 复制 ")])]),t[47]||(t[47]=p('<div class="api-block" data-v-f27ead41><h3 data-v-f27ead41>请求参数</h3><table class="param-table" data-v-f27ead41><thead data-v-f27ead41><tr data-v-f27ead41><th data-v-f27ead41>参数名</th><th data-v-f27ead41>类型</th><th data-v-f27ead41>必填</th><th data-v-f27ead41>说明</th></tr></thead><tbody data-v-f27ead41><tr data-v-f27ead41><td data-v-f27ead41><code data-v-f27ead41>document</code></td><td data-v-f27ead41>String</td><td data-v-f27ead41>是</td><td data-v-f27ead41>需求文档内容（Markdown格式）</td></tr></tbody></table></div>',1)),n("div",K,[t[43]||(t[43]=n("h3",null,"请求示例",-1)),n("div",H,[n("button",{class:l(["tab-btn",{active:a.value==="curl"}]),onClick:t[10]||(t[10]=e=>a.value="curl")}," curl ",2),n("button",{class:l(["tab-btn",{active:a.value==="javascript"}]),onClick:t[11]||(t[11]=e=>a.value="javascript")}," JavaScript ",2),n("button",{class:l(["tab-btn",{active:a.value==="python"}]),onClick:t[12]||(t[12]=e=>a.value="python")}," Python ",2),n("button",{class:l(["tab-btn",{active:a.value==="postman"}]),onClick:t[13]||(t[13]=e=>a.value="postman")}," Postman ",2)]),i(n("div",B,[t[37]||(t[37]=n("pre",null,[n("code",null,`curl -X POST /api/generator/doc/generate-configs \\
  -H "Content-Type: application/json" \\
  -d '{
    "document": "# 组件需求\\\\n\\\\n## 微码组件设计\\\\n\\\\n### 页面元素\\\\n1. 按钮"
  }'`)],-1)),n("button",{class:"btn-copy",onClick:t[14]||(t[14]=e=>s(Q))}," 复制 ")],512),[[r,a.value==="curl"]]),i(n("div",D,[t[38]||(t[38]=n("pre",null,[n("code",null,`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\\\n\\\\n## 微码组件设计'
  })
})
const result = await response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[15]||(t[15]=e=>s(_))}," 复制 ")],512),[[r,a.value==="javascript"]]),i(n("div",h,[t[39]||(t[39]=n("pre",null,[n("code",null,`import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\\\n\\\\n## 微码组件设计'
  }
)
result = response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[16]||(t[16]=e=>s(nt))}," 复制 ")],512),[[r,a.value==="python"]]),i(n("div",U,[t[41]||(t[41]=n("p",null,[n("strong",null,"Postman使用步骤：")],-1)),t[42]||(t[42]=n("ol",null,[n("li",null,"创建新的POST请求"),n("li",null,[d("输入URL: "),n("code",null,"/api/generator/doc/generate-configs")]),n("li",null,[d("在Headers中添加: "),n("code",null,"Content-Type: application/json")]),n("li",null,'在Body选项卡选择"raw"和"JSON"格式'),n("li",null,"输入JSON数据并发送")],-1)),n("div",V,[t[40]||(t[40]=n("pre",null,[n("code",null,`{
  "document": "# 组件需求\\\\n\\\\n## 微码组件设计\\\\n\\\\n### 页面元素\\\\n1. 按钮"
}`)],-1)),n("button",{class:"btn-copy",onClick:t[17]||(t[17]=e=>s(st))}," 复制 ")])],512),[[r,a.value==="postman"]])]),t[48]||(t[48]=n("div",{class:"api-block"},[n("h3",null,"响应示例"),n("div",{class:"code-block"},[n("pre",null,[n("code",null,`{
  "success": true,
  "merged": "完整的文档内容（包含配置）",
  "configs": {
    "businessEvents": "...",
    "businessStatuses": "...",
    "businessConfig": "...",
    "cssVariableConfig": "..."
  }
}`)])])],-1))]),n("section",X,[t[51]||(t[51]=n("h2",null,"健康检查",-1)),t[52]||(t[52]=n("div",{class:"api-badge get"},"GET",-1)),t[53]||(t[53]=n("p",{class:"api-description"},"检查服务器运行状态",-1)),n("div",F,[t[50]||(t[50]=n("h3",null,"请求地址",-1)),n("div",L,[t[49]||(t[49]=n("code",null,"GET /health",-1)),n("button",{class:"btn-copy",onClick:t[18]||(t[18]=e=>s("curl /health"))}," 复制 ")])]),t[54]||(t[54]=n("div",{class:"api-block"},[n("h3",null,"响应示例"),n("div",{class:"code-block"},[n("pre",null,[n("code",null,`{
  "status": "ok",
  "timestamp": "2026-07-02T04:12:03.472Z",
  "service": "langgraph-server"
}`)])])],-1))]),n("section",R,[t[65]||(t[65]=n("h2",null,"调用方式说明",-1)),t[66]||(t[66]=n("p",{class:"api-description"},"除了curl命令，还有多种方式调用API接口",-1)),n("div",G,[t[56]||(t[56]=n("h3",null,"JavaScript / TypeScript（前端）",-1)),t[57]||(t[57]=n("p",{class:"method-desc"},[n("strong",null,"使用场景："),d("在Web应用中调用API、构建用户界面时实时获取数据、用户触发操作时调用后端服务 ")],-1)),t[58]||(t[58]=n("p",{class:"method-desc"},[n("strong",null,"典型用例："),d('DocumentDesign.vue页面中的"生成配置"按钮、组件生成页（/generator/component）中的"开始生成组件"功能 ')],-1)),t[59]||(t[59]=n("p",{class:"method-desc"},[n("strong",null,"优势："),d("用户操作实时响应、可以展示加载状态和进度条、结果可以直接在页面显示 ")],-1)),n("div",W,[t[55]||(t[55]=n("pre",null,[n("code",null,`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\\\n\\\\n## 微码组件设计'
  })
})
const result = await response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[19]||(t[19]=e=>s(`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\\\n\\\\n## 微码组件设计'
  })
})
const result = await response.json()`))}," 复制 ")])]),n("div",z,[t[61]||(t[61]=n("h3",null,"Python",-1)),t[62]||(t[62]=n("p",{class:"method-desc"},[n("strong",null,"使用场景："),d("批量处理多个文档、自动化脚本和定时任务、数据分析和处理、集成到其他Python工具链 ")],-1)),t[63]||(t[63]=n("p",{class:"method-desc"},[n("strong",null,"典型用例："),d("批量生成100个组件的配置、结合pandas进行数据处理、定时任务自动生成文档 ")],-1)),t[64]||(t[64]=n("p",{class:"method-desc"},[n("strong",null,"优势："),d("适合批量操作、可以结合其他Python库、易于写自动化脚本 ")],-1)),n("div",M,[t[60]||(t[60]=n("pre",null,[n("code",null,`import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\\\n\\\\n## 微码组件设计'
  }
)
result = response.json()`)],-1)),n("button",{class:"btn-copy",onClick:t[20]||(t[20]=e=>s(`import requests

response = requests.post('/api/generator/doc/generate-configs', 
  json={
    'document': '# 组件需求\\\\n\\\\n## 微码组件设计'
  }
)
result = response.json()`))}," 复制 ")])]),t[67]||(t[67]=p('<div class="usage-method" data-v-f27ead41><h3 data-v-f27ead41>Postman / Insomnia</h3><p class="method-desc" data-v-f27ead41><strong data-v-f27ead41>使用场景：</strong>API调试和测试、开发阶段验证接口功能、学习和了解API用法、创建API文档和测试用例 </p><p class="method-desc" data-v-f27ead41><strong data-v-f27ead41>典型用例：</strong>测试新开发的API是否正常工作、验证参数格式是否正确、调试错误响应、团队共享API测试集合 </p><p class="method-desc" data-v-f27ead41><strong data-v-f27ead41>优势：</strong>图形界面操作直观、不需要写代码、可以保存请求历史、支持环境变量和测试脚本 </p><div class="guide-steps" data-v-f27ead41><p data-v-f27ead41><strong data-v-f27ead41>使用步骤：</strong></p><ol data-v-f27ead41><li data-v-f27ead41>创建新的POST请求</li><li data-v-f27ead41> 输入URL: <code data-v-f27ead41>/api/generator/doc/generate-configs</code></li><li data-v-f27ead41>在Body选项卡选择&quot;JSON&quot;格式</li><li data-v-f27ead41>输入请求数据并发送</li></ol></div></div><div class="usage-summary" data-v-f27ead41><h3 data-v-f27ead41>选择建议</h3><ul data-v-f27ead41><li data-v-f27ead41><strong data-v-f27ead41>开发Web应用</strong> → JavaScript/TypeScript</li><li data-v-f27ead41><strong data-v-f27ead41>批量处理/自动化</strong> → Python</li><li data-v-f27ead41><strong data-v-f27ead41>测试和调试</strong> → Postman/Insomnia</li></ul></div>',2))])])])]))}},pt=b(ot,[["__scopeId","data-v-f27ead41"]]);export{pt as default};
