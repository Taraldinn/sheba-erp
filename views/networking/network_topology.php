<?php
if (!hasRole('Admin') && !hasPermission('routers_olt')) {
    echo "<div class='alert alert-danger'>Access Denied.</div>";
    return;
}
require_once __DIR__ . '/../../classes/OLTManager.php';

// Tenant-local topology mapping. This table lives inside each tenant database.
try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS network_topology_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        child_type VARCHAR(30) NOT NULL,
        child_id INT NOT NULL,
        parent_type VARCHAR(30) NOT NULL,
        parent_id INT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_topology_child (child_type, child_id),
        INDEX idx_topology_parent (parent_type, parent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
} catch (Throwable $e) {}

$isAdmin = hasRole('Admin');

// Fast live reachability refresh for MikroTik and OLT nodes.
if (isset($_GET['ajax']) && $_GET['ajax'] === 'topology_status') {
    while (ob_get_level()) { @ob_end_clean(); }
    header('Content-Type: application/json; charset=utf-8');
    $out = ['ok'=>true,'updated_at'=>date('c'),'routers'=>[],'olts'=>[]];
    $tcpCheck = static function($host,$port,$timeout=.55){
        $host=trim((string)$host); $port=(int)$port;
        if($host===''||$port<=0) return false;
        $errno=0;$errstr=''; $fp=@fsockopen($host,$port,$errno,$errstr,$timeout);
        if($fp){@fclose($fp);return true;} return false;
    };
    try {
        foreach(safeFetchAll($pdo,"SELECT id,ip_address,port FROM ".TBL_ROUTERS." ORDER BY id") as $r){
            $out['routers'][(string)$r['id']]=$tcpCheck($r['ip_address']??'',$r['port']??8728);
        }
        $m=new OLTManager($pdo); $oo=$m->getAllOLTs($isAdmin?null:(int)($_SESSION['admin_id']??0));
        foreach($oo as $o){
            $port=(int)($o['port']??0); if($port<=0)$port=strtolower((string)($o['protocol']??'http'))==='https'?443:80;
            $out['olts'][(string)$o['id']]=$tcpCheck($o['ip']??'',$port);
        }
    } catch(Throwable $e){$out['ok']=false;$out['error']='Status refresh failed';}
    echo json_encode($out); exit;
}

// SAVE: OLT -> MikroTik, Master Box -> OLT, Splitter Box -> Master Box.
// CSRF token is required by the global controller and is included in the form below.
if ($_SERVER['REQUEST_METHOD']==='POST' && isset($_POST['save_topology']) && $isAdmin) {
    try {
        $pdo->beginTransaction();
        $saveMap = static function(PDO $pdo,$childType,$parentType,$items){
            if(!is_array($items)) return;
            $up=$pdo->prepare("INSERT INTO network_topology_links (child_type,child_id,parent_type,parent_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE parent_type=VALUES(parent_type), parent_id=VALUES(parent_id), updated_at=CURRENT_TIMESTAMP");
            $del=$pdo->prepare("DELETE FROM network_topology_links WHERE child_type=? AND child_id=?");
            foreach($items as $cid=>$pid){
                $cid=(int)$cid;$pid=(int)$pid; if($cid<=0)continue;
                if($pid>0)$up->execute([$childType,$cid,$parentType,$pid]); else $del->execute([$childType,$cid]);
            }
        };
        $saveMap($pdo,'olt','router',$_POST['olt_parent']??[]);
        $saveMap($pdo,'master_box','olt',$_POST['master_parent']??[]);
        $saveMap($pdo,'splitter_box','master_box',$_POST['splitter_parent']??[]);
        $pdo->commit();
        $savedOk=true;
    } catch(Throwable $e){
        if($pdo->inTransaction())$pdo->rollBack(); $saveError=$e->getMessage();
    }
}

$routers=safeFetchAll($pdo,"SELECT id,name,ip_address,port FROM ".TBL_ROUTERS." ORDER BY id");
$oltMgr=new OLTManager($pdo);
$olts=$oltMgr->getAllOLTs($isAdmin?null:(int)($_SESSION['admin_id']??0));

// Fiber boxes. Legacy Zone/point Box is treated as a Splitter Box for topology.
$allBoxes=[];
try {
    $allBoxes=safeFetchAll($pdo,"SELECT t.id,t.name,t.staff_id,t.zone_id,t.lat_long,t.fiber_code,t.box_category,t.notes,z.name zone_name FROM ".TBL_TJ_BOXES." t LEFT JOIN ".TBL_ZONES." z ON z.id=t.zone_id ORDER BY t.id");
} catch(Throwable $e){}
$masterBoxes=[];$splitterBoxes=[];
foreach($allBoxes as $b){
    $cat=strtolower(trim((string)($b['box_category']??'')));
    if(strpos($cat,'master')!==false)$masterBoxes[]=$b; else $splitterBoxes[]=$b;
}

// Users are attached by their existing TJ/Splitter Box selection.
$clients=[];
try {
    $clients=safeFetchAll($pdo,"SELECT id,name,user_id,status,bill_position,tj_box_name,router_id,manager_id,onu_mac FROM ".TBL_USERS." WHERE tj_box_name IS NOT NULL AND tj_box_name<>'' ORDER BY id");
} catch(Throwable $e){}

$links=[];
try{
    foreach(safeFetchAll($pdo,"SELECT child_type,child_id,parent_type,parent_id FROM network_topology_links") as $l){
        $links[$l['child_type'].':'.(int)$l['child_id']]=['type'=>$l['parent_type'],'id'=>(int)$l['parent_id']];
    }
}catch(Throwable $e){}

$routerIds=array_map(fn($r)=>(int)$r['id'],$routers);
$oltIds=array_map(fn($o)=>(int)$o['id'],$olts);
$masterIds=array_map(fn($b)=>(int)$b['id'],$masterBoxes);

// First-use visual fallback only; AUTO is clearly marked until Admin saves mapping.
foreach($olts as $i=>$o){$k='olt:'.(int)$o['id'];if(!isset($links[$k])&&$routerIds)$links[$k]=['type'=>'router','id'=>$routerIds[$i%count($routerIds)],'auto'=>true];}
foreach($masterBoxes as $i=>$b){$k='master_box:'.(int)$b['id'];if(!isset($links[$k])&&$oltIds)$links[$k]=['type'=>'olt','id'=>$oltIds[$i%count($oltIds)],'auto'=>true];}
foreach($splitterBoxes as $i=>$b){$k='splitter_box:'.(int)$b['id'];if(!isset($links[$k])&&$masterIds)$links[$k]=['type'=>'master_box','id'=>$masterIds[$i%count($masterIds)],'auto'=>true];}

$routerCounts=[];
try{foreach(safeFetchAll($pdo,"SELECT router_id,COUNT(*) total,SUM(CASE WHEN status='Active' AND bill_position='Active' THEN 1 ELSE 0 END) active_count FROM ".TBL_USERS." GROUP BY router_id") as $r)$routerCounts[(int)$r['router_id']]=['total'=>(int)$r['total'],'active'=>(int)$r['active_count']];}catch(Throwable $e){}
$boxCounts=[];
foreach($clients as $c){$n=trim((string)$c['tj_box_name']);if($n==='')continue;if(!isset($boxCounts[$n]))$boxCounts[$n]=['total'=>0,'active'=>0];$boxCounts[$n]['total']++;if(($c['status']??'')==='Active'&&($c['bill_position']??'')==='Active')$boxCounts[$n]['active']++;}
$oltCounts=[];
foreach($olts as $o){$total=0;$online=0;$cached=json_decode((string)($o['onu_cache']??''),true);if(is_array($cached)){if(isset($cached['onu_list'])&&is_array($cached['onu_list']))$cached=$cached['onu_list'];foreach($cached as $onu){if(!is_array($onu))continue;$total++;$st=strtolower((string)($onu['state']??$onu['status']??''));if(in_array($st,['connect','connected','active','online','up'],true))$online++;}}$oltCounts[(int)$o['id']]=['total'=>$total,'online'=>$online];}

// Name -> box id for automatic User attachment.
$splitterByName=[];$masterByName=[];
foreach($splitterBoxes as $b)$splitterByName[mb_strtolower(trim((string)$b['name']))]=(int)$b['id'];
foreach($masterBoxes as $b)$masterByName[mb_strtolower(trim((string)$b['name']))]=(int)$b['id'];

$payload=[
 'routers'=>array_map(function($r)use($routerCounts){$id=(int)$r['id'];$c=$routerCounts[$id]??['total'=>0,'active'=>0];return['id'=>$id,'name'=>$r['name'],'ip'=>$r['ip_address'],'port'=>(int)($r['port']??8728),'total'=>$c['total'],'active'=>$c['active']];},$routers),
 'olts'=>array_map(function($o)use($links,$oltCounts){$id=(int)$o['id'];$p=$links['olt:'.$id]??null;$c=$oltCounts[$id]??['total'=>0,'online'=>0];return['id'=>$id,'name'=>$o['name'],'brand'=>$o['brand']??'OLT','ip'=>$o['ip']??'','parent'=>$p['id']??0,'auto'=>!empty($p['auto']),'total'=>$c['total'],'online'=>$c['online']];},$olts),
 'masters'=>array_map(function($b)use($links,$boxCounts){$id=(int)$b['id'];$p=$links['master_box:'.$id]??null;$c=$boxCounts[$b['name']]??['total'=>0,'active'=>0];return['id'=>$id,'name'=>$b['name'],'zone'=>$b['zone_name']??'','parent'=>$p['id']??0,'auto'=>!empty($p['auto']),'total'=>$c['total'],'active'=>$c['active']];},$masterBoxes),
 'splitters'=>array_map(function($b)use($links,$boxCounts){$id=(int)$b['id'];$p=$links['splitter_box:'.$id]??null;$c=$boxCounts[$b['name']]??['total'=>0,'active'=>0];return['id'=>$id,'name'=>$b['name'],'zone'=>$b['zone_name']??'','parent'=>$p['id']??0,'auto'=>!empty($p['auto']),'total'=>$c['total'],'active'=>$c['active']];},$splitterBoxes),
 'users'=>[]
];
foreach($clients as $c){
    $n=mb_strtolower(trim((string)$c['tj_box_name']));$ptype='';$pid=0;
    if(isset($splitterByName[$n])){$ptype='splitter';$pid=$splitterByName[$n];}
    elseif(isset($masterByName[$n])){$ptype='master';$pid=$masterByName[$n];}
    else continue;
    $payload['users'][]=['id'=>(int)$c['id'],'name'=>$c['name'],'user_id'=>$c['user_id'],'parent_type'=>$ptype,'parent'=>$pid,'active'=>(($c['status']??'')==='Active'&&($c['bill_position']??'')==='Active')];
}
?>
<style>
.topology-shell{background:#050b12;border:1px solid #132231;border-radius:14px;min-height:700px;color:#e8f6ff;position:relative;overflow:hidden}.topology-head{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:17px 20px;border-bottom:1px solid #132231;background:linear-gradient(180deg,#07111b,#050b12)}.topology-title{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:800;letter-spacing:.04em;margin:0;color:#f6fbff}.topology-title .pulse{display:inline-block;width:10px;height:10px;border-radius:50%;background:#17d7c3;box-shadow:0 0 13px #17d7c3;margin-right:12px;animation:tpPulse 1.7s infinite}@keyframes tpPulse{50%{opacity:.45;box-shadow:0 0 3px #17d7c3}}.topology-meta{font:10px ui-monospace,monospace;color:#6f8a9f}.topology-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.topology-btn{border:1px solid #244052;background:#0c1721;color:#d9f3ff;border-radius:8px;padding:7px 11px;font-size:12px}.topology-btn.primary{background:#063641;border-color:#10c6d7;color:#c9fbff}.topology-canvas{position:relative;min-height:590px;overflow:auto;padding:24px 15px 50px}.topology-stage{position:relative;min-width:1050px;min-height:650px}.topology-svg{position:absolute;inset:0;width:100%;height:100%;z-index:1;overflow:visible}.tp-link{fill:none;stroke:#12dbe8;stroke-width:1.4;opacity:.55;filter:drop-shadow(0 0 4px rgba(18,219,232,.55))}.tp-flow{fill:none;stroke:#62f5ff;stroke-width:2;stroke-linecap:round;stroke-dasharray:2 17;animation:tpFlow 2.2s linear infinite;opacity:.9}@keyframes tpFlow{to{stroke-dashoffset:-38}}.tp-node{position:absolute;background:linear-gradient(155deg,#0b1722,#0a121b);border:1px solid #0fbdd0;border-radius:9px;padding:10px;color:#f6fdff;box-shadow:0 0 18px rgba(0,200,220,.08);transform:translate(-50%,-50%);z-index:2;cursor:pointer;transition:.18s;text-align:left}.tp-node:hover{border-color:#61f2ff;transform:translate(-50%,-50%) scale(1.025)}.tp-node.router{width:165px;min-height:76px}.tp-node.olt{width:155px;min-height:74px}.tp-node.master{width:145px;min-height:68px;border-color:#8d6bff}.tp-node.splitter{width:136px;min-height:64px;border-color:#ffb23e}.tp-node.user{width:112px;min-height:48px;border-color:#315064;padding:7px 9px}.tp-kicker{font:7px ui-monospace,monospace;color:#5f8193;letter-spacing:.14em;text-transform:uppercase}.tp-name{font:700 11px ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}.tp-metric{font:700 9px ui-monospace,monospace;color:#1ce7f5;margin-top:4px}.tp-sub{font:8px ui-monospace,monospace;color:#718f9f;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tp-status{position:absolute;right:8px;top:8px;width:7px;height:7px;border-radius:50%;background:#6b7f8c}.tp-status.online{background:#35e883;box-shadow:0 0 7px #35e883}.tp-status.offline{background:#ff4d64;box-shadow:0 0 7px #ff4d64}.tp-auto{font-size:7px;color:#f5bd51;margin-left:3px}.topology-config{display:none;background:#07111a;border-top:1px solid #153040;padding:18px}.topology-config.open{display:block}.topology-config .form-select{font-size:12px}.topology-config table{color:#dbeef5}.topology-config th{color:#7294a5;font-size:10px;text-transform:uppercase}.topology-config td{border-color:#153040!important;font-size:12px;vertical-align:middle}.topology-legend{display:flex;gap:14px;flex-wrap:wrap;padding:9px 20px;border-top:1px solid #102431;color:#6b8899;font:10px ui-monospace,monospace}.legend-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}.legend-dot.on{background:#35e883}.legend-dot.off{background:#ff4d64}.tp-detail{position:absolute;right:16px;bottom:15px;width:270px;background:#0a151f;border:1px solid #1a3544;border-radius:10px;padding:14px;z-index:4;display:none}.tp-detail.open{display:block}.tp-detail h6{font:700 13px ui-monospace,monospace;margin:0 0 9px}.tp-detail-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-top:1px solid #102633;font:10px ui-monospace,monospace;color:#7292a4}.tp-detail-row b{color:#d7f5ff;text-align:right}.saved-note{margin:12px 15px 0}.fiber-hint{border:1px solid #183647;background:#08151f;border-radius:9px;padding:9px 12px;color:#84a6b8;font-size:11px;margin-bottom:12px}.fiber-hint strong{color:#e9f9ff}@media(max-width:767px){.topology-head{align-items:flex-start}.topology-title{font-size:14px}.topology-canvas{padding:12px 8px}.topology-stage{min-width:1050px}.topology-config{overflow-x:auto}}
</style>
<div class="topology-shell">
 <div class="topology-head"><div><h4 class="topology-title"><span class="pulse"></span>Live ISP Network — Traffic Monitor</h4><div class="topology-meta mt-1">MikroTik → OLT → Master Box → Splitter Box → User</div></div><div class="topology-toolbar"><span class="topology-meta" id="tpUpdated">Waiting for live status…</span><button type="button" class="topology-btn" id="tpRefresh"><i class="fas fa-sync-alt me-1"></i>Refresh</button><?php if($isAdmin):?><button type="button" class="topology-btn primary" id="tpEdit"><i class="fas fa-project-diagram me-1"></i>Edit Topology</button><?php endif;?></div></div>
 <?php if(!empty($savedOk)):?><div class="alert alert-success saved-note py-2"><i class="fas fa-check-circle me-1"></i>Topology mapping saved successfully. The saved parent selections are now active.</div><?php endif;?>
 <?php if(!empty($saveError)):?><div class="alert alert-danger saved-note py-2"><?=htmlspecialchars($saveError)?></div><?php endif;?>
 <div class="topology-canvas" id="tpCanvas"><div class="topology-stage" id="tpStage"><svg class="topology-svg" id="tpSvg" aria-hidden="true"></svg></div><div class="tp-detail" id="tpDetail"><h6 id="tpDetailName"></h6><div id="tpDetailRows"></div></div></div>
 <?php if($isAdmin):?><div class="topology-config" id="tpConfig"><form method="post" action="?tab=network_topology">
 <input type="hidden" name="csrf_token" value="<?=htmlspecialchars(get_csrf_token(),ENT_QUOTES)?>"><input type="hidden" name="save_topology" value="1">
 <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3"><div><strong>Fiber Topology Mapping</strong><div class="topology-meta">Saved in this tenant database only.</div></div><button type="submit" class="btn btn-sm btn-info"><i class="fas fa-save me-1"></i>Save Mapping</button></div>
 <div class="fiber-hint"><strong>Required chain:</strong> MikroTik → OLT → Master Box → Splitter Box → User. Users automatically follow the TJ/Splitter Box selected in the client profile.</div>
 <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Node</th><th>Type</th><th>Connect Under</th></tr></thead><tbody>
 <?php foreach($olts as $o):$p=$links['olt:'.(int)$o['id']]??null;?><tr><td><?=htmlspecialchars($o['name'])?></td><td>OLT</td><td><select class="form-select form-select-sm" name="olt_parent[<?=(int)$o['id']?>]"><option value="0">No MikroTik</option><?php foreach($routers as $r):?><option value="<?=(int)$r['id']?>" <?=((int)($p['id']??0)===(int)$r['id'])?'selected':''?>><?=htmlspecialchars($r['name'])?></option><?php endforeach;?></select></td></tr><?php endforeach;?>
 <?php foreach($masterBoxes as $b):$p=$links['master_box:'.(int)$b['id']]??null;?><tr><td><?=htmlspecialchars($b['name'])?></td><td>Master Box</td><td><select class="form-select form-select-sm" name="master_parent[<?=(int)$b['id']?>]"><option value="0">No OLT</option><?php foreach($olts as $o):?><option value="<?=(int)$o['id']?>" <?=((int)($p['id']??0)===(int)$o['id'])?'selected':''?>><?=htmlspecialchars($o['name'])?></option><?php endforeach;?></select></td></tr><?php endforeach;?>
 <?php foreach($splitterBoxes as $b):$p=$links['splitter_box:'.(int)$b['id']]??null;?><tr><td><?=htmlspecialchars($b['name'])?></td><td>Splitter Box</td><td><select class="form-select form-select-sm" name="splitter_parent[<?=(int)$b['id']?>]"><option value="0">No Master Box</option><?php foreach($masterBoxes as $m):?><option value="<?=(int)$m['id']?>" <?=((int)($p['id']??0)===(int)$m['id'])?'selected':''?>><?=htmlspecialchars($m['name'])?></option><?php endforeach;?></select></td></tr><?php endforeach;?>
 </tbody></table></div></form></div><?php endif;?>
 <div class="topology-legend"><span><i class="legend-dot on"></i>online/reachable</span><span><i class="legend-dot off"></i>offline/unreachable</span><span>Purple = Master Box</span><span>Orange = Splitter Box</span><span>User status = billing active/inactive</span></div>
</div>
<script>
(()=>{const data=<?=json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)?>;const stage=document.getElementById('tpStage'),svg=document.getElementById('tpSvg');if(!stage||!svg)return;const pos=new Map(),nodes=new Map();
const spread=(n,y,l=8,r=92)=>{if(n<=0)return[];if(n===1)return[{x:50,y}];return Array.from({length:n},(_,i)=>({x:l+(r-l)*(i/(n-1)),y}));};
const rp=spread(data.routers.length,8,25,75);data.routers.forEach((r,i)=>pos.set('router:'+r.id,rp[i]));
function groupLayout(items,parentKey,parentType,y,spanBase){const groups={};items.forEach(o=>(groups[o.parent]??=[]).push(o));const parents=parentType==='router'?data.routers:parentType==='olt'?data.olts:data.masters;parents.forEach(p=>{const g=groups[p.id]||[],pp=pos.get(parentType+':'+p.id)||{x:50};const span=Math.min(34,Math.max(10,g.length*spanBase));g.forEach((o,i)=>pos.set(parentKey+':'+o.id,{x:g.length===1?pp.x:pp.x-span/2+span*(i/(g.length-1)),y}));});items.filter(o=>!pos.has(parentKey+':'+o.id)).forEach((o,i,a)=>pos.set(parentKey+':'+o.id,spread(a.length,y,8,92)[i]));}
groupLayout(data.olts,'olt','router',26,9);groupLayout(data.masters,'master','olt',45,8);groupLayout(data.splitters,'splitter','master',63,7);
const userGroups={};data.users.forEach(u=>(userGroups[u.parent_type+':'+u.parent]??=[]).push(u));let maxY=80;Object.entries(userGroups).forEach(([pk,g])=>{const pp=pos.get(pk)||{x:50};const cols=Math.min(5,Math.max(1,g.length));g.forEach((u,i)=>{const row=Math.floor(i/cols),col=i%cols;const width=Math.min(38,Math.max(10,cols*7));const x=cols===1?pp.x:pp.x-width/2+width*(col/(cols-1));const y=80+row*9;maxY=Math.max(maxY,y);pos.set('user:'+u.id,{x,y});});});stage.style.minHeight=Math.max(650,520+(maxY-75)*10)+'px';
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function add(type,o){const p=pos.get(type+':'+o.id);if(!p)return;const el=document.createElement('button');el.type='button';el.className='tp-node '+type;el.style.left=p.x+'%';el.style.top=p.y+'%';el.dataset.key=type+':'+o.id;let kicker='',metric='',sub='';if(type==='router'){kicker='MIKROTIK';metric=`${o.active}/${o.total} active clients`;sub=`${o.ip}:${o.port}`;}else if(type==='olt'){kicker='OLT';metric=o.total?`${o.online}/${o.total} cached ONUs`:'ONU cache';sub=`${o.brand} · ${o.ip}`;}else if(type==='master'){kicker='MASTER BOX';metric=`${o.active}/${o.total} direct users`;sub=o.zone||'Fiber distribution';}else if(type==='splitter'){kicker='SPLITTER BOX';metric=`${o.active}/${o.total} users`;sub=o.zone||'Last mile';}else{kicker='USER';metric=o.active?'ACTIVE':'INACTIVE';sub=o.user_id||'';}el.innerHTML=`<span class="tp-status ${type==='user'?(o.active?'online':'offline'):''}" data-status-key="${type}:${o.id}"></span><div class="tp-kicker">${kicker}${o.auto?'<span class="tp-auto"> AUTO</span>':''}</div><div class="tp-name">${esc(o.name)}</div><div class="tp-metric">${esc(metric)}</div><div class="tp-sub">${esc(sub)}</div>`;el.addEventListener('click',()=>detail(type,o));stage.appendChild(el);nodes.set(type+':'+o.id,el);}
data.routers.forEach(o=>add('router',o));data.olts.forEach(o=>add('olt',o));data.masters.forEach(o=>add('master',o));data.splitters.forEach(o=>add('splitter',o));data.users.forEach(o=>add('user',o));
function curve(a,b){const A=pos.get(a),B=pos.get(b);if(!A||!B)return;const w=stage.clientWidth,h=stage.clientHeight,x1=A.x/100*w,y1=A.y/100*h,x2=B.x/100*w,y2=B.y/100*h,mid=(y1+y2)/2,d=`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;for(const cls of ['tp-link','tp-flow']){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);p.setAttribute('class',cls);svg.appendChild(p);}}
function draw(){svg.innerHTML='';data.olts.forEach(o=>o.parent&&curve('router:'+o.parent,'olt:'+o.id));data.masters.forEach(o=>o.parent&&curve('olt:'+o.parent,'master:'+o.id));data.splitters.forEach(o=>o.parent&&curve('master:'+o.parent,'splitter:'+o.id));data.users.forEach(u=>u.parent&&curve(u.parent_type+':'+u.parent,'user:'+u.id));}requestAnimationFrame(draw);window.addEventListener('resize',()=>requestAnimationFrame(draw));
const dbox=document.getElementById('tpDetail'),dn=document.getElementById('tpDetailName'),dr=document.getElementById('tpDetailRows');function detail(type,o){dn.textContent=o.name;const rows=[];rows.push(['Type',type.toUpperCase()]);if(o.ip)rows.push(['IP',o.ip]);if(o.zone)rows.push(['Zone',o.zone]);if(o.user_id)rows.push(['User ID',o.user_id]);if(o.total!==undefined)rows.push(['Total',o.total]);if(o.active!==undefined)rows.push(['Active',typeof o.active==='boolean'?(o.active?'Yes':'No'):o.active]);dr.innerHTML=rows.map(r=>`<div class="tp-detail-row"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join('');dbox.classList.add('open');}
async function refresh(){const u=new URL(location.href);u.searchParams.set('tab','network_topology');u.searchParams.set('ajax','topology_status');try{const res=await fetch(u,{headers:{'X-Requested-With':'XMLHttpRequest'},cache:'no-store'}),j=await res.json();if(j.routers)Object.entries(j.routers).forEach(([id,on])=>{const e=document.querySelector(`[data-status-key="router:${id}"]`);if(e)e.className='tp-status '+(on?'online':'offline');});if(j.olts)Object.entries(j.olts).forEach(([id,on])=>{const e=document.querySelector(`[data-status-key="olt:${id}"]`);if(e)e.className='tp-status '+(on?'online':'offline');});document.getElementById('tpUpdated').textContent='Updated '+new Date().toLocaleTimeString();}catch(e){document.getElementById('tpUpdated').textContent='Live refresh failed';}}
document.getElementById('tpRefresh')?.addEventListener('click',refresh);document.getElementById('tpEdit')?.addEventListener('click',()=>document.getElementById('tpConfig')?.classList.toggle('open'));refresh();setInterval(refresh,30000);
})();
</script>
