export type Point = {x:number;y:number;z:number};
export const FEATURE_VERSION='world-single-v1';
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y+a.z*b.z;
const norm=(a:Point)=>Math.sqrt(dot(a,a));
const cross=(a:Point,b:Point):Point=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=(a:Point):Point=>{const n=norm(a);if(n<1e-8)throw Error('Degenerate hand geometry');return{x:a.x/n,y:a.y/n,z:a.z/n};};
const angle=(a:Point,b:Point)=>Math.acos(Math.max(-1,Math.min(1,dot(unit(a),unit(b)))))/Math.PI;
export function features(points:Point[],hand:string){
 if(points.length!==21 || points.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw Error('Expected 21 finite world landmarks');
 if(!['Left','Right'].includes(hand))throw Error('Unknown handedness');
 const scale=norm(sub(points[9],points[0]));
 if(scale<1e-8)throw Error('Degenerate palm scale');
 // Canonicalize left-hand reflection; retain orientation in the canonical camera frame.
 const p=points.map(v=>({x:(v.x-points[0].x)/scale*(hand==='Left'?-1:1),y:(v.y-points[0].y)/scale,z:(v.z-points[0].z)/scale}));
 const bends:number[]=[];
 for(const ids of [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]){
  for(let i=1;i<=2;i++)bends.push(angle(sub(p[ids[i-1]],p[ids[i]]),sub(p[ids[i+1]],p[ids[i]])));
 }
 const spread=[[5,8,9,12],[9,12,13,16],[13,16,17,20]].map(([a,b,c,d])=>angle(sub(p[b],p[a]),sub(p[d],p[c])));
 const distances=[8,12,16,20].map(i=>norm(sub(p[4],p[i])));
 const n=unit(cross(sub(p[5],p[0]),sub(p[17],p[0])));
 const geometry=[...bends,...spread,...distances,n.x,n.y,n.z];
 const coordinates=p.flatMap(v=>[v.x,v.y,v.z]);
 return {coordinates,geometry,combined:[...coordinates,...geometry],bends,normal:n};
}
