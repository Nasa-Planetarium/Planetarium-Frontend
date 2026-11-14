export type Device = "web" | "tablet" | "phone" | "foldable";

/**
 * 기기군 판정 — 목업 index.html 첫 스크립트(EM_DETECT_DEVICE)를 글자 그대로 옮긴 것.
 * app/layout.tsx 가 <head> 안 인라인 스크립트로 첫 그림 전에 실행해 html[data-device|data-touch|data-cover] 를 단다.
 * 덮어쓰기: 주소 ?device=web|tablet|phone|foldable(fold)
 * 언어는 경로(/ko · /en)가 정하므로 여기서 정하지 않는다(루트 / 만 언어를 고른다 — app/page.tsx).
 */
export const DEVICE_SCRIPT = `(function(){var DEVICES={web:1,tablet:1,phone:1,foldable:1};function mq(s){try{return matchMedia(s).matches}catch(e){return false}}
window.EM_DETECT_DEVICE=function(){var q=null;try{q=new URLSearchParams(location.search).get("device")}catch(e){}if(q==="fold")q="foldable";
var w=window.innerWidth||1440,h=window.innerHeight||900,coarse=mq("(pointer:coarse)"),ar=w/h,d;
if(DEVICES[q])d=q;else if((coarse&&w>=600&&w<=900&&ar>=0.8&&ar<=1.25)||mq("(horizontal-viewport-segments:2)"))d="foldable";
else if(w<768||(h<=500&&coarse))d="phone";else if(w<1240)d="tablet";else d="web";
return{device:d,touch:coarse,cover:d==="phone"&&w<400,forced:!!DEVICES[q]}};
window.EM_APPLY_DEVICE=function(){try{var r=window.EM_DETECT_DEVICE(),de=document.documentElement;de.setAttribute("data-device",r.device);de.setAttribute("data-touch",r.touch?"1":"0");if(r.cover)de.setAttribute("data-cover","1");else de.removeAttribute("data-cover");return r}catch(e){return null}};
window.EM_APPLY_DEVICE();})();`;
