import {AmbientLight,BoxGeometry,Color,CylinderGeometry,DirectionalLight,Group,Mesh,MeshStandardMaterial,PerspectiveCamera,Raycaster,Scene,TorusGeometry,Vector2,Vector3,WebGLRenderer,type Material,type Object3D} from 'three';
import {gsap} from 'gsap';
import type {SectionId} from '@/content/pm-intelligence-world/types';
import {sceneLayout,type SceneSelection} from '@/lib/pm-intelligence-world/scene-layout';
export interface WorldHandle {setSelection:(selection:SceneSelection)=>void;setMotionEnabled:(enabled:boolean)=>void;setVisible:(visible:boolean)=>void;dispose:()=>void}
export function createWorld({container,onFocus,onFailure}:{container:HTMLElement;onFocus:(section:SectionId)=>void;onFailure:()=>void}):WorldHandle{
 const style=getComputedStyle(container); const brand=(token:string)=>new Color(style.getPropertyValue(token).trim());
 const cyan=brand('--brand-cyan'),blue=brand('--brand-blue'),purple=brand('--brand-purple'),pink=brand('--brand-pink');
 const ink=new Color(getComputedStyle(container).color);const surface=ink.clone().multiplyScalar(.12);
 const scene=new Scene();scene.background=ink.clone().multiplyScalar(.018);
 const camera=new PerspectiveCamera(38,1,.1,120);camera.position.set(...sceneLayout.overview.camera);
 const target=new Vector3();const renderer=new WebGLRenderer({antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<=768?1:1.5));container.appendChild(renderer.domElement);
 renderer.domElement.setAttribute('aria-label','Illustrative PM Intelligence world; use the HTML navigation to explore.');
 scene.add(new AmbientLight(ink,2.2));const light=new DirectionalLight(ink,4);light.position.set(4,12,6);scene.add(light);
 const pickable:Object3D[]=[];const nodes=new Map<SectionId,Group>();const materials:MeshStandardMaterial[]=[];
 const material=(color:Color,metalness=.2)=>{const m=new MeshStandardMaterial({color,metalness,roughness:.55});materials.push(m);return m;};
 const neutral=material(surface);const ground=material(ink.clone().multiplyScalar(.035));const line=material(blue.clone().multiplyScalar(.45));
 const mesh=(geometry:BoxGeometry|CylinderGeometry|TorusGeometry,m:MeshStandardMaterial,parent:Group|Scene,x=0,y=0,z=0)=>{const object=new Mesh(geometry,m);object.position.set(x,y,z);parent.add(object);return object;};
 mesh(new CylinderGeometry(12,12,.18,80),ground,scene,0,-.35,0);
 const addNode=(id:SectionId,color:Color)=>{const node=new Group();node.position.set(...sceneLayout[id].position);scene.add(node);nodes.set(id,node);const m=material(color.clone().multiplyScalar(.48));const base=mesh(new CylinderGeometry(1.55,1.7,.3,48),neutral,node);base.userData.section=id;pickable.push(base);const ring=mesh(new TorusGeometry(1.55,.026,8,80),material(color),node,0,.2,0);ring.rotation.x=Math.PI/2;return {node,m};};
 const commons=addNode('knowledge',cyan);
 for(let i=0;i<4;i++){mesh(new BoxGeometry(2.1,.1,1.5),commons.m,commons.node,0,.5+i*.48,0);for(let j=0;j<5;j++)mesh(new BoxGeometry(.15,.3,.8),material(cyan.clone().multiplyScalar(.25+j*.08)),commons.node,-.8+j*.4,.7+i*.48,0);}
 const core=mesh(new TorusGeometry(.65,.045,10,64),material(cyan),commons.node,0,3.1,0);core.rotation.x=Math.PI/2;
 const input=addNode('inputs',pink);
 for(let i=0;i<3;i++){const x=(i-1)*.65;mesh(new BoxGeometry(.4,.9+i*.35,.65),input.m,input.node,x,.6+i*.17,0);mesh(new BoxGeometry(.42,.025,.67),material(pink),input.node,x,1.1+i*.35,0);}
 for(const [id,color] of [['writing',blue],['questions',purple],['learning',cyan],['decisions',blue]] as const){const {node,m}=addNode(id,color);mesh(new BoxGeometry(1.7,.16,1.15),m,node,0,.6,0);for(let i=0;i<3;i++){const block=mesh(new BoxGeometry(1.2,.1,.75),material(color.clone().multiplyScalar(.4+i*.15)),node,(i-1)*.12,.85+i*.23,(i-1)*.08);block.rotation.y=-.16;}}
 for(const id of ['inputs','writing','questions','learning','decisions'] as SectionId[]){const p=new Vector3(...sceneLayout[id].position);const length=p.length()-3;const strip=mesh(new BoxGeometry(.035,.025,length),line,scene,p.x/2,-.2,p.z/2);strip.rotation.y=Math.atan2(p.x,p.z);for(let i=0;i<3;i++)mesh(new BoxGeometry(.07,.07,.07),material(cyan),scene,p.x*(.3+i*.15),-.12,p.z*(.3+i*.15));}
 let frame=0,disposed=false,visible=true,motion=true;let current:SceneSelection={section:'overview',selectedInput:null,selectedRecord:null};let tweens:gsap.core.Tween[]=[];
 const draw=()=>{frame=0;if(disposed||!visible)return;camera.lookAt(target);renderer.render(scene,camera);};const invalidate=()=>{if(!frame&&!disposed&&visible)frame=requestAnimationFrame(draw);};
 const resize=()=>{const {width,height}=container.getBoundingClientRect();if(!width||!height)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);invalidate();};
 const observer=new ResizeObserver(resize);observer.observe(container);resize();
 const raycaster=new Raycaster();const pointer=new Vector2();
 const pick=(event:PointerEvent)=>{if(event.pointerType==='mouse'&&event.button!==0)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(pickable)[0];if(hit)onFocus(hit.object.userData.section as SectionId);};
 renderer.domElement.addEventListener('pointerup',pick);
 const lost=(event:Event)=>{event.preventDefault();onFailure();};renderer.domElement.addEventListener('webglcontextlost',lost);
 const setSelection=(selection:SceneSelection)=>{current=selection;tweens.forEach(t=>t.kill());tweens=[];const pose=sceneLayout[selection.section];for(const [id,node]of nodes)node.scale.setScalar(id===selection.section?1.12:1);if(!motion){camera.position.set(...pose.camera);target.set(...pose.position);invalidate();return;}tweens=[gsap.to(camera.position,{x:pose.camera[0],y:pose.camera[1],z:pose.camera[2],duration:.85,ease:'power2.inOut',onUpdate:invalidate}),gsap.to(target,{x:pose.position[0],y:pose.position[1],z:pose.position[2],duration:.85,ease:'power2.inOut',onUpdate:invalidate})];};
 return {setSelection,setMotionEnabled(enabled){motion=enabled;setSelection(current);},setVisible(value){visible=value;tweens.forEach(t=>value?t.resume():t.pause());if(value)invalidate();else cancelAnimationFrame(frame);frame=0;},dispose(){if(disposed)return;disposed=true;tweens.forEach(t=>t.kill());cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('pointerup',pick);renderer.domElement.removeEventListener('webglcontextlost',lost);scene.traverse(object=>{if(object instanceof Mesh)object.geometry.dispose();});new Set<Material>(materials).forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();}};
}
