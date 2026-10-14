import {useEffect,useRef} from 'react';
import type {SectionId} from '@/content/pm-intelligence-world/types';
import type {SceneSelection} from '@/lib/pm-intelligence-world/scene-layout';
import {createWorld,type WorldHandle} from './three/createWorld';
import styles from './experience.module.css';
export function WorldScene({selection,onFocus,onFailure}:{selection:SceneSelection;onFocus:(section:SectionId)=>void;onFailure:()=>void}){
 const container=useRef<HTMLDivElement>(null);const handle=useRef<WorldHandle|null>(null);
 const focusRef=useRef(onFocus);focusRef.current=onFocus;const failRef=useRef(onFailure);failRef.current=onFailure;
 useEffect(()=>{if(!container.current)return;let world:WorldHandle;try{world=createWorld({container:container.current,onFocus:s=>focusRef.current(s),onFailure:()=>failRef.current()});}catch{failRef.current();return;}handle.current=world;const media=matchMedia('(prefers-reduced-motion: reduce)');const motion=()=>world.setMotionEnabled(!media.matches);const visibility=()=>world.setVisible(!document.hidden);media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);motion();visibility();return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);world.dispose();handle.current=null;};},[]);
 useEffect(()=>{handle.current?.setSelection(selection);},[selection]);
 return <div className={styles.scene} ref={container} data-testid="world-scene"/>;
}
