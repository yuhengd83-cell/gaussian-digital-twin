/* AGV Viewer v5.5.8.4 — read-only ROS2 receiver client.
 * Protocol: agv-ros2-sub-v1.  No ROS pose/vehicle motion is modified.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel = $('ros2Panel');
  const openBtn = $('ros2Btn');
  if (!panel || !openBtn) return;
  const PROTOCOL = 'agv-ros2-sub-v1';
  const endpointInput = $('ros2Endpoint');
  const tokenInput = $('ros2Token');
  const topicList = $('ros2TopicList');
  const nodeList = $('ros2NodeList');
  const topicSearch = $('ros2TopicSearch');
  const topicCount = $('ros2TopicCount');
  const subscribeCount = $('ros2SubCount');
  const pickedCount = $('ros2PickedCount');
  const status = $('ros2ConnState');
  const toast = $('ros2Info');
  const preview = $('ros2MsgPreview');
  const msgTopicSelect = $('ros2MsgTopicSelect');
  const stats = $('ros2MsgStats');
  const sourceTag = $('ros2Source');
  const domainTag = $('ros2Domain');
  const stage = { ws:null, connected:false, source:'',topics:[],nodes:[], selected:new Set(), subscribed:new Set(), messages:new Map(), counts:new Map(), timestamp:new Map(), nodeFilter:null, timer:0 };
  const get = id => $(id);
  function info(text, isError=false){
    toast.textContent = String(text);
    toast.classList.toggle('ros2Error', !!isError);
  }
  function pill(text, kind='offline'){
    status.textContent=text;
    status.dataset.mode=kind;
    const led = $('ros2ToolbarLed');
    if(led)led.dataset.mode=kind;
    openBtn.classList.toggle('active',kind==='online'||kind==='demo');
  }
  function canSend(){return stage.ws && stage.ws.readyState===WebSocket.OPEN && stage.connected;}
  function send(packet){
    if(!canSend()){info('尚未连接桥接端；先点击「连接」。',true);return false;}
    stage.ws.send(JSON.stringify(packet));return true;
  }
  function show(on){
    panel.classList.toggle('open',on);
    panel.setAttribute('aria-hidden',String(!on));
    openBtn.setAttribute('aria-expanded',String(on));
    if(on)panel.scrollTop=0;
  }
  openBtn.addEventListener('click',()=>show(!panel.classList.contains('open')));
  $('ros2CloseBtn').addEventListener('click',()=>show(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.classList.contains('open'))show(false);});
  panel.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea,select') && e.key!=='Escape')e.stopPropagation();
  });
  document.querySelectorAll('#toolbar .toolbtn:not(#ros2Btn)').forEach(el=>el.addEventListener('click',()=>show(false)));
  function selectTab(which){
    for(const t of ['topics','nodes','messages']){
      const on = which===t;
      get('ros2Tab-'+t).classList.toggle('active',on);
      get('ros2Tab-'+t).setAttribute('aria-selected',String(on));
      get('ros2TabContent-'+t).hidden=!on;
    }
  }
  for(const t of ['topics','nodes','messages'])get('ros2Tab-'+t).addEventListener('click',()=>selectTab(t));
  function counts(){
    topicCount.textContent=String(stage.topics.length);
    pickedCount.textContent=String(stage.selected.size);
    subscribeCount.textContent=String(stage.subscribed.size);
    $('ros2SubscribeBtn').disabled=!stage.connected||stage.selected.size===0;
    $('ros2UnsubscribeBtn').disabled=!stage.connected||!([...stage.selected].some(x=>stage.subscribed.has(x)));
    $('ros2UnsubscribeAllBtn').disabled=!stage.connected||stage.subscribed.size===0;
    $('ros2RefreshBtn').disabled=!stage.connected;
  }
  const el = (tag, text, className) => {
    const e=document.createElement(tag);
    if(text!==undefined && text!==null)e.textContent=String(text);
    if(className)e.className=className;
    return e;
  };
  function renderTopics(){
    topicList.replaceChildren();
    const term=topicSearch.value.trim().toLowerCase();
    let candidates=stage.topics.filter(x=>x.name.toLowerCase().includes(term)||x.types.join(' ').toLowerCase().includes(term));
    if(stage.nodeFilter)candidates=candidates.filter(x=>stage.nodeFilter.has(x.name));
    if(!candidates.length){topicList.append(el('div', stage.connected?'没有匹配的话题，请刷新或清除筛选。':'连接后自动显示 ROS2 话题列表。','ros2Placeholder'));counts();return;}
    for(const t of candidates){
      const row=el('label',null,'ros2TopicRow');
      const check=el('input');check.type='checkbox';check.checked=stage.selected.has(t.name);check.dataset.topic=t.name;
      check.addEventListener('change',()=>{
        if(check.checked)stage.selected.add(t.name);else stage.selected.delete(t.name);
        counts();
      });
      const desc=el('span',null,'ros2TopicDesc');
      desc.append(el('strong',t.name));
      desc.append(el('small',t.types.join(', ')||'unknown type'));
      const right=el('span',null,'ros2TopicRight');
      right.append(el('span',stage.subscribed.has(t.name)?'已订阅':'未订阅',stage.subscribed.has(t.name)?'ros2Subscribed':'ros2Idle'));
      right.append(el('small','发布 '+(t.publishers??'?')));
      row.append(check,desc,right);
      topicList.append(row);
    }
    counts();
  }
  function renderNodes(){
    nodeList.replaceChildren();
    if(!stage.nodes.length){nodeList.append(el('div','尚无节点信息。','ros2Placeholder'));return;}
    for(const n of stage.nodes){
      const row=el('div',null,'ros2NodeRow');
      row.append(el('strong',(n.namespace==='/'?'':n.namespace)+ '/' + n.name));
      row.append(el('small','发布 '+(n.publishes?.length||0)+' 个话题 · 订阅 '+(n.subscribes?.length||0)+' 个话题'));
      if(n.publishes?.length){
        const btn=el('button','查看其发布话题','ros2SmallBtn');
        btn.addEventListener('click',()=>{
          stage.nodeFilter=new Set(n.publishes);
          topicSearch.value='';selectTab('topics');renderTopics();
          info('已筛选节点 '+n.name+' 发布的话题。');
        });
        row.append(btn);
      }
      nodeList.append(row);
    }
  }
  function renderMessageSelector(){
    const choice=msgTopicSelect.value;
    msgTopicSelect.replaceChildren();
    if(stage.subscribed.size===0)msgTopicSelect.append(el('option','尚未订阅任何话题'));
    for(const name of [...stage.subscribed].sort()){
      const option=el('option',name);option.value=name;msgTopicSelect.append(option);
    }
    if(stage.subscribed.has(choice))msgTopicSelect.value=choice;
    renderPreview();
  }
  function renderPreview(){
    const name=msgTopicSelect.value;
    const message=stage.messages.get(name);
    if(!message){preview.textContent=stage.subscribed.size?'已订阅，等待该话题发布新消息…':'尚无订阅数据。';stats.textContent='';return;}
    preview.textContent=JSON.stringify(message.payload,null,2);
    const when=stage.timestamp.get(name)||[];
    const now=Date.now();
    const hz=when.filter(t=>now-t<=5000).length/5;
    stats.textContent=`话题 ${name}\n消息序号 ${message.seq} · 页面已收到 ${stage.counts.get(name)||0} 条\n页面接收速率 ≈ ${hz.toFixed(1)} 条/秒（桥接端限频，并非原始发布频率）\n最近消息 ${new Date(message.received_at*1000).toLocaleTimeString()} · ${message.source}`;
  }
  msgTopicSelect.addEventListener('change',renderPreview);
  function cleanup(reason){
    if(stage.timer){clearTimeout(stage.timer);stage.timer=0;}
    stage.connected=false;stage.subscribed.clear();stage.selected.clear();stage.messages.clear();stage.counts.clear();stage.timestamp.clear();stage.nodeFilter=null;
    stage.topics=[];stage.nodes=[];stage.ws=null;sourceTag.textContent='--';domainTag.textContent='--';
    pill('未连接','offline');
    $('ros2ConnectBtn').disabled=false;$('ros2DisconnectBtn').disabled=true;
    counts();renderTopics();renderNodes();renderMessageSelector();
    if(reason)info(reason,true);
  }
  function connect(){
    if(stage.ws)return;
    let endpoint=endpointInput.value.trim();
    if(!/^wss?:\/\//i.test(endpoint)){info('地址必须以 ws:// 或 wss:// 开头。',true);return;}
    if(location.protocol==='https:'&&endpoint.startsWith('ws://')){
      info('HTTPS 页面不能使用不安全 ws://；本地 http:// 测试可用，公网必须使用 wss://。',true);return;
    }
    try {localStorage.setItem('agv-ros2-bridge-url-v5584',endpoint);}catch(_){ }
    pill('连接中…','connecting');$('ros2ConnectBtn').disabled=true;
    info('正在连接桥接端 '+endpoint+'；成功建立 WebSocket 后还需完成握手。');
    let ws;
    try {ws=new WebSocket(endpoint);}catch(e){cleanup('地址不可用：'+e.message);return;}
    stage.ws=ws;
    stage.timer=setTimeout(()=>{if(!stage.connected&&stage.ws===ws)ws.close(1000,'handshake timeout');},8000);
    ws.addEventListener('open',()=>{
      if(stage.ws!==ws)return;
      ws.send(JSON.stringify({op:'hello',protocol:PROTOCOL,token:tokenInput.value||''}));
      tokenInput.value=''; // never persist access tokens on disk
    });
    ws.addEventListener('message',e=>{
      if(stage.ws!==ws)return;
      let data;
      try{data=JSON.parse(e.data);}catch(_){info('桥接端返回非 JSON 数据。',true);return;}
      switch(data.op){
        case 'hello':
          if(!data.ok||data.protocol!==PROTOCOL){info('桥接端协议不匹配。',true);ws.close();break;}
          if(stage.timer){clearTimeout(stage.timer);stage.timer=0;}
          stage.connected=true;stage.source=data.source;
          pill(data.source==='DEMO'?'演示数据（非 ROS2）':'已连接 ROS2',data.source==='DEMO'?'demo':'online');
          sourceTag.textContent=data.source==='DEMO'?'演示模式 · 无 ROS2':'真实 ROS2 · 只读';
          domainTag.textContent=String(data.domain_id??'?');
          $('ros2ConnectBtn').disabled=true;$('ros2DisconnectBtn').disabled=false;
          info(data.source==='DEMO'?'桥接连接成功，但当前只提供演示话题。':'ROS2 桥接已连接。点击选择话题后订阅，不会控制 AGV。');counts();break;
        case 'graph':
          stage.topics=Array.isArray(data.topics)?data.topics.filter(x=>x&&typeof x.name==='string'&&Array.isArray(x.types)):[];
          stage.nodes=Array.isArray(data.nodes)?data.nodes:[];
          stage.nodeFilter=null;renderTopics();renderNodes();
          info(`发现 ${stage.topics.length} 个话题、${stage.nodes.length} 个节点。可多选话题后点击订阅。`);break;
        case 'subscribe_result':
          if(data.error)info(data.error,true);
          else{
            for(const item of data.results||[]){if(item.ok)stage.subscribed.add(item.topic);}
            const success=(data.results||[]).filter(x=>x.ok);
            const failures=(data.results||[]).filter(x=>!x.ok);
            info(`订阅结果：${success.length} 成功、${failures.length} 失败。`+(failures.length?' '+failures.map(x=>x.topic+': '+x.detail).join('；'):''),!!failures.length);
          }
          renderTopics();renderMessageSelector();break;
        case 'unsubscribe_result':
          for(const name of data.removed||[]){stage.subscribed.delete(name);stage.selected.delete(name);}
          renderTopics();renderMessageSelector();info('取消订阅完成。');break;
        case 'message':
          if(!stage.subscribed.has(data.topic))break;
          stage.messages.set(data.topic,data);
          stage.counts.set(data.topic,(stage.counts.get(data.topic)||0)+1);
          const arr=stage.timestamp.get(data.topic)||[];arr.push(Date.now());
          while(arr.length && Date.now()-arr[0]>5000)arr.shift();
          stage.timestamp.set(data.topic,arr);
          if(msgTopicSelect.value===data.topic)renderPreview();
          break;
        case 'error':info('ROS2 桥接错误：'+(data.message||'unknown'),true);break;
      }
    });
    ws.addEventListener('close',event=>{
      if(stage.ws===ws)cleanup('桥接连接已断开（'+event.code+'）。请检查 ROS2 桥接进程和网络。');
    });
    ws.addEventListener('error',()=>{
      if(stage.ws===ws)info('连接失败：检查 ROS2 桥接服务、电脑 IP、8765 端口及防火墙。',true);
    });
  }
  $('ros2ConnectBtn').addEventListener('click',connect);
  $('ros2DisconnectBtn').addEventListener('click',()=>{if(stage.ws)stage.ws.close(1000,'user disconnect');});
  $('ros2RefreshBtn').addEventListener('click',()=>send({op:'graph'}));
  $('ros2SubscribeBtn').addEventListener('click',()=>{
    const topics=[...stage.selected].filter(n=>!stage.subscribed.has(n));
    if(!topics.length){info('已选话题均已订阅；等待最新消息。');return;}
    send({op:'subscribe',topics});
  });
  $('ros2UnsubscribeBtn').addEventListener('click',()=>send({op:'unsubscribe',topics:[...stage.selected].filter(x=>stage.subscribed.has(x))}));
  $('ros2UnsubscribeAllBtn').addEventListener('click',()=>send({op:'unsubscribe',topics:'all'}));
  $('ros2NodeFilterClear').addEventListener('click',()=>{stage.nodeFilter=null;renderTopics();info('已清除节点筛选。');});
  topicSearch.addEventListener('input',renderTopics);
  try{const saved=localStorage.getItem('agv-ros2-bridge-url-v5584');if(saved&&/^wss?:\/\//.test(saved))endpointInput.value=saved;}catch(_){ }
  fetch('./config/ros2_receiver.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(cfg=>{
    if(cfg?.protocol===PROTOCOL && !endpointInput.value)endpointInput.value=cfg.defaultWebSocketUrl;
  }).catch(()=>{});
  cleanup('尚未连接。请先在 ROS2 电脑上启动桥接，再输入地址。');
  window.__AGV_ROS2_RECEIVER={
    version:'5.5.8.4',
    getStatus:()=>({connected:stage.connected,source:stage.source,topics:stage.topics.length,subscribed:[...stage.subscribed]}),
    open:()=>show(true),
  };
})();
