import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{Tn as r}from"./ccip-DNwZND7k.js";import{A as i,P as a,c as o,et as s,ft as c,gt as l,r as u}from"./events-context-BJ75xIIf-6KY42PM6.js";import{C as d}from"./context-DEETNFc9-CEbnmTaX.js";var f=`-ms-`,p=`-moz-`,m=`-webkit-`,h=`comm`,g=`rule`,_=`decl`,v=`@import`,y=`@namespace`,b=`@keyframes`,x=`@layer`,ee=Math.abs,te=String.fromCharCode,S=Object.assign;function C(e,t){return E(e,0)^45?(((t<<2^E(e,0))<<2^E(e,1))<<2^E(e,2))<<2^E(e,3):0}function ne(e){return e.trim()}function w(e,t){return(e=t.exec(e))?e[0]:e}function T(e,t,n){return e.replace(t,n)}function re(e,t,n){return e.indexOf(t,n)}function E(e,t){return e.charCodeAt(t)|0}function D(e,t,n){return e.slice(t,n)}function O(e){return e.length}function ie(e){return e.length}function k(e,t){return t.push(e),e}function ae(e,t){return e.map(t).join(``)}function oe(e,t){return e.filter(function(e){return!w(e,t)})}var se=1,A=1,ce=0,j=0,M=0,N=``;function le(e,t,n,r,i,a,o,s){return{value:e,root:t,parent:n,type:r,props:i,children:a,line:se,column:A,length:o,return:``,siblings:s}}function P(e,t){return S(le(``,null,null,``,null,null,0,e.siblings),e,{length:-e.length},t)}function F(e){for(;e.root;)e=P(e.root,{children:[e]});k(e,e.siblings)}function ue(){return M}function de(){return M=j>0?E(N,--j):0,A--,M===10&&(A=1,se--),M}function I(){return M=j<ce?E(N,j++):0,A++,M===10&&(A=1,se++),M}function L(){return E(N,j)}function fe(){return j}function pe(e,t){return D(N,e,t)}function R(e){switch(e){case 0:case 9:case 10:case 13:case 32:return 5;case 33:case 43:case 44:case 47:case 62:case 64:case 126:case 59:case 123:case 125:return 4;case 58:return 3;case 34:case 39:case 40:case 91:return 2;case 41:case 93:return 1}return 0}function me(e){return se=A=1,ce=O(N=e),j=0,[]}function he(e){return N=``,e}function ge(e){return ne(pe(j-1,ye(e===91?e+2:e===40?e+1:e)))}function _e(e){for(;(M=L())&&M<33;)I();return R(e)>2||R(M)>3?``:` `}function ve(e,t){for(;--t&&I()&&!(M<48||M>102||M>57&&M<65||M>70&&M<97););return pe(e,fe()+(t<6&&L()==32&&I()==32))}function ye(e){for(;I();)switch(M){case e:return j;case 34:case 39:e!==34&&e!==39&&ye(M);break;case 40:e===41&&ye(e);break;case 92:I();break}return j}function be(e,t){for(;I()&&e+M!==57&&!(e+M===84&&L()===47););return`/*`+pe(t,j-1)+`*`+te(e===47?e:I())}function xe(e){for(;!R(L());)I();return pe(e,j)}function Se(e){return he(Ce(``,null,null,null,[``],e=me(e),0,[0],e))}function Ce(e,t,n,r,i,a,o,s,c){for(var l=0,u=0,d=o,f=0,p=0,m=0,h=1,g=1,_=1,v=0,y=``,b=i,x=a,S=r,C=y;g;)switch(m=v,v=I()){case 40:if(m!=108&&E(C,d-1)==58){re(C+=T(ge(v),`&`,`&\f`),`&\f`,ee(l?s[l-1]:0))!=-1&&(_=-1);break}case 34:case 39:case 91:C+=ge(v);break;case 9:case 10:case 13:case 32:C+=_e(m);break;case 92:C+=ve(fe()-1,7);continue;case 47:switch(L()){case 42:case 47:k(Te(be(I(),fe()),t,n,c),c),(R(m||1)==5||R(L()||1)==5)&&O(C)&&D(C,-1,void 0)!==` `&&(C+=` `);break;default:C+=`/`}break;case 123*h:s[l++]=O(C)*_;case 125*h:case 59:case 0:switch(v){case 0:case 125:g=0;case 59+u:_==-1&&(C=T(C,/\f/g,``)),p>0&&(O(C)-d||h===0&&m===47)&&k(p>32?Ee(C+`;`,r,n,d-1,c):Ee(T(C,` `,``)+`;`,r,n,d-2,c),c);break;case 59:C+=`;`;default:if(k(S=we(C,t,n,l,u,i,s,y,b=[],x=[],d,a),a),v===123)if(u===0)Ce(C,t,S,S,b,a,d,s,x);else{switch(f){case 99:if(E(C,3)===110)break;case 108:if(E(C,2)===97)break;default:u=0;case 100:case 109:case 115:}u?Ce(e,S,S,r&&k(we(e,S,S,0,0,i,s,y,i,b=[],d,x),x),i,x,d,s,r?b:x):Ce(C,S,S,S,[``],x,0,s,x)}}l=u=p=0,h=_=1,y=C=``,d=o;break;case 58:d=1+O(C),p=m;default:if(h<1){if(v==123)--h;else if(v==125&&h++==0&&de()==125)continue}switch(C+=te(v),v*h){case 38:_=u>0?1:(C+=`\f`,-1);break;case 44:s[l++]=(O(C)-1)*_,_=1;break;case 64:L()===45&&(C+=ge(I())),f=L(),u=d=O(y=C+=xe(fe())),v++;break;case 45:m===45&&O(C)==2&&(h=0)}}return a}function we(e,t,n,r,i,a,o,s,c,l,u,d){for(var f=i-1,p=i===0?a:[``],m=ie(p),h=0,_=0,v=0;h<r;++h)for(var y=0,b=D(e,f+1,f=ee(_=o[h])),x=e;y<m;++y)(x=ne(_>0?p[y]+` `+b:T(b,/&\f/g,p[y])))&&(c[v++]=x);return le(e,t,n,i===0?g:s,c,l,u,d)}function Te(e,t,n,r){return le(e,t,n,h,te(ue()),D(e,2,-2),0,r)}function Ee(e,t,n,r,i){return le(e,t,n,_,D(e,0,r),D(e,r+1,-1),r,i)}function De(e,t,n){switch(C(e,t)){case 5103:return m+`print-`+e+e;case 5737:case 4201:case 3177:case 3433:case 1641:case 4457:case 2921:case 5572:case 6356:case 5844:case 3191:case 6645:case 3005:case 4215:case 6389:case 5109:case 5365:case 5621:case 3829:case 6391:case 5879:case 5623:case 6135:case 4599:return m+e+e;case 4855:return m+e.replace(`add`,`source-over`).replace(`substract`,`source-out`).replace(`intersect`,`source-in`).replace(`exclude`,`xor`)+e;case 4789:return p+e+e;case 5349:case 4246:case 4810:case 6968:case 2756:return m+e+p+e+f+e+e;case 5936:switch(E(e,t+11)){case 114:return m+e+f+T(e,/[svh]\w+-[tblr]{2}/,`tb`)+e;case 108:return m+e+f+T(e,/[svh]\w+-[tblr]{2}/,`tb-rl`)+e;case 45:return m+e+f+T(e,/[svh]\w+-[tblr]{2}/,`lr`)+e}case 6828:case 4268:case 2903:return m+e+f+e+e;case 6165:return m+e+f+`flex-`+e+e;case 5187:return m+e+T(e,/(\w+).+(:[^]+)/,m+`box-$1$2`+f+`flex-$1$2`)+e;case 5443:return m+e+f+`flex-item-`+T(e,/flex-|-self/g,``)+(w(e,/flex-|baseline/)?``:f+`grid-row-`+T(e,/flex-|-self/g,``))+e;case 4675:return m+e+f+`flex-line-pack`+T(e,/align-content|flex-|-self/g,``)+e;case 5548:return m+e+f+T(e,`shrink`,`negative`)+e;case 5292:return m+e+f+T(e,`basis`,`preferred-size`)+e;case 6060:return m+`box-`+T(e,`-grow`,``)+m+e+f+T(e,`grow`,`positive`)+e;case 4554:return m+T(e,/([^-])(transform)/g,`$1`+m+`$2`)+e;case 6187:return T(T(T(e,/(zoom-|grab)/,m+`$1`),/(image-set)/,m+`$1`),e,``)+e;case 5495:case 3959:return T(e,/(image-set\([^]*)/,m+"$1$`$1");case 4968:return T(T(e,/(.+:)(flex-)?(.*)/,m+`box-pack:$3`+f+`flex-pack:$3`),/space-between/,`justify`)+m+e+e;case 4200:if(!w(e,/flex-|baseline/))return f+`grid-column-align`+D(e,t)+e;break;case 2592:case 3360:return f+T(e,`template-`,``)+e;case 4384:case 3616:return n&&n.some(function(e,n){return t=n,w(e.props,/grid-\w+-end/)})?~re(e+(n=n[t].value),`span`,0)?e:f+T(e,`-start`,``)+e+f+`grid-row-span:`+(~re(n,`span`,0)?w(n,/\d+/):w(n,/\d+/)-+w(e,/\d+/))+`;`:f+T(e,`-start`,``)+e;case 4896:case 4128:return n&&n.some(function(e){return w(e.props,/grid-\w+-start/)})?e:f+T(T(e,`-end`,`-span`),`span `,``)+e;case 4095:case 3583:case 4068:case 2532:return T(e,/(.+)-inline(.+)/,m+`$1$2`)+e;case 8116:case 7059:case 5753:case 5535:case 5445:case 5701:case 4933:case 4677:case 5533:case 5789:case 5021:case 4765:if(O(e)-1-t>6)switch(E(e,t+1)){case 109:if(E(e,t+4)!==45)break;case 102:return T(e,/(.+:)(.+)-([^]+)/,`$1`+m+`$2-$3$1`+p+(E(e,t+3)==108?`$3`:`$2-$3`))+e;case 115:return~re(e,`stretch`,0)?De(T(e,`stretch`,`fill-available`),t,n)+e:e}break;case 5152:case 5920:return T(e,/(.+?):(\d+)(\s*\/\s*(span)?\s*(\d+))?(.*)/,function(t,n,r,i,a,o,s){return f+n+`:`+r+s+(i?f+n+`-span:`+(a?o:o-+r)+s:``)+e});case 4949:if(E(e,t+6)===121)return T(e,`:`,`:`+m)+e;break;case 6444:switch(E(e,E(e,14)===45?18:11)){case 120:return T(e,/(.+:)([^;\s!]+)(;|(\s+)?!.+)?/,`$1`+m+(E(e,14)===45?`inline-`:``)+`box$3$1`+m+`$2$3$1`+f+`$2box$3`)+e;case 100:return T(e,`:`,`:`+f)+e}break;case 5719:case 2647:case 2135:case 3927:case 2391:return T(e,`scroll-`,`scroll-snap-`)+e}return e}function Oe(e,t){for(var n=``,r=0;r<e.length;r++)n+=t(e[r],r,e,t)||``;return n}function ke(e,t,n,r){switch(e.type){case x:if(e.children.length)break;case v:case y:case _:return e.return=e.return||e.value;case h:return``;case b:return e.return=e.value+`{`+Oe(e.children,r)+`}`;case g:if(!O(e.value=e.props.join(`,`)))return``}return O(n=Oe(e.children,r))?e.return=e.value+`{`+n+`}`:``}function Ae(e){var t=ie(e);return function(n,r,i,a){for(var o=``,s=0;s<t;s++)o+=e[s](n,r,i,a)||``;return o}}function je(e){return function(t){t.root||(t=t.return)&&e(t)}}function Me(e,t,n,r){if(e.length>-1&&!e.return)switch(e.type){case _:e.return=De(e.value,e.length,n);return;case b:return Oe([P(e,{value:T(e.value,`@`,`@`+m)})],r);case g:if(e.length)return ae(n=e.props,function(t){switch(w(t,r=/(::plac\w+|:read-\w+)/)){case`:read-only`:case`:read-write`:F(P(e,{props:[T(t,/:(read-\w+)/,`:`+p+`$1`)]})),F(P(e,{props:[t]})),S(e,{props:oe(n,r)});break;case`::placeholder`:F(P(e,{props:[T(t,/:(plac\w+)/,`:`+m+`input-$1`)]})),F(P(e,{props:[T(t,/:(plac\w+)/,`:`+p+`$1`)]})),F(P(e,{props:[T(t,/:(plac\w+)/,f+`input-$1`)]})),F(P(e,{props:[t]})),S(e,{props:oe(n,r)});break}return``})}}var z=e(t()),B=typeof process<`u`&&({}.REACT_APP_SC_ATTR||{}.SC_ATTR)||`data-styled`,Ne=`active`,Pe=`data-styled-version`,Fe=`6.4.4`,Ie=`/*!sc*/
`,V=typeof window<`u`&&typeof document<`u`;function Le(e){if(typeof process<`u`){let t={}[e];if(t!==void 0&&t!==``)return t!==`false`}}var Re=!!(typeof SC_DISABLE_SPEEDY==`boolean`?SC_DISABLE_SPEEDY:Le(`REACT_APP_SC_DISABLE_SPEEDY`)??Le(`SC_DISABLE_SPEEDY`)??(typeof process<`u`&&!1)),ze=`sc-keyframes-`,Be={};function H(e,...t){return Error(`An error occurred. See https://github.com/styled-components/styled-components/blob/main/packages/styled-components/src/utils/errors.md#${e} for more information.${t.length>0?` Args: ${t.join(`, `)}`:``}`)}var Ve=new Map,He=new Map,Ue=1,U=e=>{if(Ve.has(e))return Ve.get(e);for(;He.has(Ue);)Ue++;let t=Ue++;return Ve.set(e,t),He.set(t,e),t},We=e=>He.get(e),Ge=(e,t)=>{Ue=t+1,Ve.set(e,t),He.set(t,e)},Ke=Object.freeze([]),W=Object.freeze({});function qe(e,t,n=W){return e.theme!==n.theme&&e.theme||t||n.theme}var Je=/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~-]+/g,Ye=/(^-|-$)/g;function Xe(e){return e.replace(Je,`-`).replace(Ye,``)}var Ze=/(a)(d)/gi,Qe=e=>String.fromCharCode(e+(e>25?39:97));function $e(e){let t,n=``;for(t=Math.abs(e);t>52;t=t/52|0)n=Qe(t%52)+n;return(Qe(t%52)+n).replace(Ze,`$1-$2`)}var et=5381,G=(e,t)=>{let n=t.length;for(;n;)e=33*e^t.charCodeAt(--n);return e},tt=e=>G(et,e);function nt(e){return $e(tt(e)>>>0)}function rt(e){return e.displayName||e.name||`Component`}function it(e){return typeof e==`string`&&!0}function at(e){return it(e)?`styled.${e}`:`Styled(${rt(e)})`}var ot=Symbol.for(`react.memo`),st=Symbol.for(`react.forward_ref`),ct={contextType:!0,defaultProps:!0,displayName:!0,getDerivedStateFromError:!0,getDerivedStateFromProps:!0,propTypes:!0,type:!0},lt={name:!0,length:!0,prototype:!0,caller:!0,callee:!0,arguments:!0,arity:!0},ut={$$typeof:!0,compare:!0,defaultProps:!0,displayName:!0,propTypes:!0,type:!0},dt={[st]:{$$typeof:!0,render:!0,defaultProps:!0,displayName:!0,propTypes:!0},[ot]:ut};function ft(e){return(`type`in(t=e)&&t.type.$$typeof)===ot?ut:`$$typeof`in e?dt[e.$$typeof]:ct;var t}var pt=Object.defineProperty,mt=Object.getOwnPropertyNames,ht=Object.getOwnPropertySymbols,gt=Object.getOwnPropertyDescriptor,_t=Object.getPrototypeOf,vt=Object.prototype;function yt(e,t,n){if(typeof t!=`string`){let r=_t(t);r&&r!==vt&&yt(e,r,n);let i=mt(t).concat(ht(t)),a=ft(e),o=ft(t);for(let r=0;r<i.length;++r){let s=i[r];if(!(s in lt||n&&n[s]||o&&s in o||a&&s in a)){let n=gt(t,s);try{pt(e,s,n)}catch{}}}}return e}function K(e){return typeof e==`function`}var bt=Symbol.for(`react.forward_ref`);function xt(e){return e!=null&&(typeof e==`object`||typeof e==`function`)&&e.$$typeof===bt&&`styledComponentId`in e}function q(e,t){return e&&t?e+` `+t:e||t||``}function St(e,t){return e.join(t||``)}function J(e){return typeof e==`object`&&!!e&&e.constructor.name===Object.name&&!(`props`in e&&e.$$typeof)}function Ct(e,t,n=!1){if(!n&&!J(e)&&!Array.isArray(e))return t;if(Array.isArray(t))for(let n=0;n<t.length;n++)e[n]=Ct(e[n],t[n]);else if(J(t))for(let n in t)e[n]=Ct(e[n],t[n]);return e}function wt(e,t){Object.defineProperty(e,"toString",{value:t})}var Tt=class{constructor(e){this.groupSizes=new Uint32Array(512),this.length=512,this.tag=e,this._cGroup=0,this._cIndex=0}indexOfGroup(e){if(e===this._cGroup)return this._cIndex;let t=this._cIndex;if(e>this._cGroup)for(let n=this._cGroup;n<e;n++)t+=this.groupSizes[n];else for(let n=this._cGroup-1;n>=e;n--)t-=this.groupSizes[n];return this._cGroup=e,this._cIndex=t,t}insertRules(e,t){if(e>=this.groupSizes.length){let t=this.groupSizes,n=t.length,r=n;for(;e>=r;)if(r<<=1,r<0)throw H(16,`${e}`);this.groupSizes=new Uint32Array(r),this.groupSizes.set(t),this.length=r;for(let e=n;e<r;e++)this.groupSizes[e]=0}let n=this.indexOfGroup(e+1),r=0;for(let i=0,a=t.length;i<a;i++)this.tag.insertRule(n,t[i])&&(this.groupSizes[e]++,n++,r++);r>0&&this._cGroup>e&&(this._cIndex+=r)}clearGroup(e){if(e<this.length){let t=this.groupSizes[e],n=this.indexOfGroup(e),r=n+t;this.groupSizes[e]=0;for(let e=n;e<r;e++)this.tag.deleteRule(n);t>0&&this._cGroup>e&&(this._cIndex-=t)}}getGroup(e){let t=``;if(e>=this.length||this.groupSizes[e]===0)return t;let n=this.groupSizes[e],r=this.indexOfGroup(e),i=r+n;for(let e=r;e<i;e++)t+=this.tag.getRule(e)+Ie;return t}},Et=`style[${B}][${Pe}="${Fe}"]`,Dt=RegExp(`^${B}\\.g(\\d+)\\[id="([\\w\\d-]+)"\\].*?"([^"]*)`),Ot=e=>typeof ShadowRoot<`u`&&e instanceof ShadowRoot||`host`in e&&e.nodeType===11,kt=e=>{if(!e)return document;if(Ot(e))return e;if(`getRootNode`in e){let t=e.getRootNode();if(Ot(t))return t}return document},At=(e,t,n)=>{let r=n.split(`,`),i;for(let n=0,a=r.length;n<a;n++)(i=r[n])&&e.registerName(t,i)},jt=(e,t)=>{let n=(t.textContent??``).split(Ie),r=[];for(let t=0,i=n.length;t<i;t++){let i=n[t].trim();if(!i)continue;let a=i.match(Dt);if(a){let t=0|parseInt(a[1],10),n=a[2];t!==0&&(Ge(n,t),At(e,n,a[3]),e.getTag().insertRules(t,r)),r.length=0}else r.push(i)}},Mt=e=>{let t=kt(e.options.target).querySelectorAll(Et);for(let n=0,r=t.length;n<r;n++){let r=t[n];r&&r.getAttribute(B)!==Ne&&(jt(e,r),r.parentNode&&r.parentNode.removeChild(r))}},Y=!1;function Nt(){if(!1!==Y)return Y;if(typeof document<`u`){let e=document.head.querySelector(`meta[property="csp-nonce"]`);if(e)return Y=e.nonce||e.getAttribute(`content`)||void 0;let t=document.head.querySelector(`meta[name="sc-nonce"]`);if(t)return Y=t.getAttribute(`content`)||void 0}return Y=typeof __webpack_nonce__<`u`?__webpack_nonce__:void 0}var Pt=(e,t)=>{let n=document.head,r=e||n,i=document.createElement(`style`),a=(e=>{let t=Array.from(e.querySelectorAll(`style[${B}]`));return t[t.length-1]})(r),o=a===void 0?null:a.nextSibling;i.setAttribute(B,Ne),i.setAttribute(Pe,Fe);let s=t||Nt();return s&&i.setAttribute(`nonce`,s),r.insertBefore(i,o),i},Ft=class{constructor(e,t){this.element=Pt(e,t),this.element.appendChild(document.createTextNode(``)),this.sheet=(e=>{if(e.sheet)return e.sheet;let t=e.getRootNode().styleSheets??document.styleSheets;for(let n=0,r=t.length;n<r;n++){let r=t[n];if(r.ownerNode===e)return r}throw H(17)})(this.element),this.length=0}insertRule(e,t){try{return this.sheet.insertRule(t,e),this.length++,!0}catch{return!1}}deleteRule(e){this.sheet.deleteRule(e),this.length--}getRule(e){let t=this.sheet.cssRules[e];return t&&t.cssText?t.cssText:``}},It=class{constructor(e,t){this.element=Pt(e,t),this.nodes=this.element.childNodes,this.length=0}insertRule(e,t){if(e<=this.length&&e>=0){let n=document.createTextNode(t);return this.element.insertBefore(n,this.nodes[e]||null),this.length++,!0}return!1}deleteRule(e){this.element.removeChild(this.nodes[e]),this.length--}getRule(e){return e<this.length?this.nodes[e].textContent:``}},Lt=V,Rt={isServer:!V,useCSSOMInjection:!Re},zt=class e{static registerId(e){return U(e)}constructor(e=W,t={},n){this.options=Object.assign(Object.assign({},Rt),e),this.gs=t,this.keyframeIds=new Set,this.names=new Map(n),this.server=!!e.isServer,!this.server&&V&&Lt&&(Lt=!1,Mt(this)),wt(this,()=>(e=>{let t=e.getTag(),{length:n}=t,r=``;for(let i=0;i<n;i++){let n=We(i);if(n===void 0)continue;let a=e.names.get(n);if(a===void 0||!a.size)continue;let o=t.getGroup(i);if(o.length===0)continue;let s=B+`.g`+i+`[id="`+n+`"]`,c=``;for(let e of a)e.length>0&&(c+=e+`,`);r+=o+s+`{content:"`+c+`"}/*!sc*/
`}return r})(this))}rehydrate(){!this.server&&V&&Mt(this)}reconstructWithOptions(t,n=!0){let r=new e(Object.assign(Object.assign({},this.options),t),this.gs,n&&this.names||void 0);return r.keyframeIds=new Set(this.keyframeIds),!this.server&&V&&t.target!==this.options.target&&kt(this.options.target)!==kt(t.target)&&Mt(r),r}allocateGSInstance(e){return this.gs[e]=(this.gs[e]||0)+1}getTag(){return this.tag||=(e=(({useCSSOMInjection:e,target:t,nonce:n})=>e?new Ft(t,n):new It(t,n))(this.options),new Tt(e));var e}hasNameForId(e,t){var n;return(n=this.names.get(e)?.has(t))!=null&&n}registerName(e,t){U(e),e.startsWith(ze)&&this.keyframeIds.add(e);let n=this.names.get(e);n?n.add(t):this.names.set(e,new Set([t]))}insertRules(e,t,n){this.registerName(e,t),this.getTag().insertRules(U(e),n)}clearNames(e){this.names.has(e)&&this.names.get(e).clear()}clearRules(e){this.getTag().clearGroup(U(e)),this.clearNames(e)}clearTag(){this.tag=void 0}},Bt=new WeakSet,Vt={animationIterationCount:1,aspectRatio:1,borderImageOutset:1,borderImageSlice:1,borderImageWidth:1,columnCount:1,columns:1,flex:1,flexGrow:1,flexShrink:1,gridRow:1,gridRowEnd:1,gridRowSpan:1,gridRowStart:1,gridColumn:1,gridColumnEnd:1,gridColumnSpan:1,gridColumnStart:1,fontWeight:1,lineHeight:1,opacity:1,order:1,orphans:1,scale:1,tabSize:1,widows:1,zIndex:1,zoom:1,WebkitLineClamp:1,fillOpacity:1,floodOpacity:1,stopOpacity:1,strokeDasharray:1,strokeDashoffset:1,strokeMiterlimit:1,strokeOpacity:1,strokeWidth:1};function Ht(e,t){return t==null||typeof t==`boolean`||t===``?``:typeof t!=`number`||t===0||e in Vt||e.startsWith(`--`)?String(t).trim():t+`px`}var X=47;function Ut(e){if(e.charCodeAt(0)===45&&e.charCodeAt(1)===45)return e;let t=``;for(let n=0;n<e.length;n++){let r=e.charCodeAt(n);t+=r>=65&&r<=90?`-`+String.fromCharCode(r+32):e[n]}return t.startsWith(`ms-`)?`-`+t:t}var Wt=Symbol.for(`sc-keyframes`);function Gt(e){return typeof e==`object`&&!!e&&Wt in e}function Kt(e){return K(e)&&!(e.prototype&&e.prototype.isReactComponent)}var qt=e=>e==null||!1===e||e===``,Jt=Symbol.for(`react.client.reference`);function Yt(e){return e.$$typeof===Jt}function Xt(e,t){for(let n in e){let r=e[n];e.hasOwnProperty(n)&&!qt(r)&&(Array.isArray(r)&&Bt.has(r)||K(r)?t.push(Ut(n)+`:`,r,`;`):J(r)?(t.push(n+` {`),Xt(r,t),t.push(`}`)):t.push(Ut(n)+`: `+Ht(n,r)+`;`))}}function Z(e,t,n,r,i=[]){if(qt(e))return i;let a=typeof e;if(a===`string`)return i.push(e),i;if(a===`function`)return Yt(e)?i:Kt(e)&&t?Z(e(t),t,n,r,i):(i.push(e),i);if(Array.isArray(e)){for(let a=0;a<e.length;a++)Z(e[a],t,n,r,i);return i}return xt(e)?(i.push(`.${e.styledComponentId}`),i):Gt(e)?(n?(e.inject(n,r),i.push(e.getName(r))):i.push(e),i):Yt(e)?i:J(e)&&e.toString===Object.prototype.toString?(Xt(e,i),i):(i.push(e.toString()),i)}var Zt=tt(Fe),Qt=class{constructor(e,t,n){this.rules=e,this.componentId=t,this.baseHash=G(Zt,t),this.baseStyle=n,zt.registerId(t)}generateAndInjectStyles(e,t,n){let r=this.baseStyle?this.baseStyle.generateAndInjectStyles(e,t,n):``;{let i=``;for(let r=0;r<this.rules.length;r++){let a=this.rules[r];if(typeof a==`string`)i+=a;else if(a)if(Kt(a)){let r=a(e);typeof r==`string`?i+=r:r!=null&&!1!==r&&(i+=St(Z(r,e,t,n)))}else i+=St(Z(a,e,t,n))}if(i){this.dynamicNameCache||=new Map;let e=n.hash?n.hash+i:i,a=this.dynamicNameCache.get(e);if(!a){if(a=$e(G(G(this.baseHash,n.hash),i)>>>0),this.dynamicNameCache.size>=200){let e=this.dynamicNameCache.keys().next().value;e!==void 0&&this.dynamicNameCache.delete(e)}this.dynamicNameCache.set(e,a)}if(!t.hasNameForId(this.componentId,a)){let e=n(i,`.`+a,void 0,this.componentId);t.insertRules(this.componentId,a,e)}r=q(r,a)}}return r}},$t=/&/g;function en(e,t){let n=0;for(;--t>=0&&e.charCodeAt(t)===92;)n++;return!(1&~n)}function tn(e){let t=e.length,n=``,r=0,i=0,a=0,o=!1,s=!1;for(let c=0;c<t;c++){let l=e.charCodeAt(c);if(a!==0||o||l!==X||e.charCodeAt(c+1)!==42)if(o)l===42&&e.charCodeAt(c+1)===X&&(o=!1,c++);else if(l!==34&&l!==39||en(e,c)){if(a===0)if(l===123)i++;else if(l===125){if(i--,i<0){s=!0;let n=c+1;for(;n<t;){let t=e.charCodeAt(n);if(t===59||t===10)break;n++}n<t&&e.charCodeAt(n)===59&&n++,i=0,c=n-1,r=n;continue}i===0&&(n+=e.substring(r,c+1),r=c+1)}else l===59&&i===0&&(n+=e.substring(r,c+1),r=c+1)}else a===0?a=l:a===l&&(a=0);else o=!0,c++}return s||i!==0||a!==0?(r<t&&i===0&&a===0&&(n+=e.substring(r)),n):e}function nn(e,t){let n=t+` `,r=`,`+n;for(let i=0;i<e.length;i++){let a=e[i];if(a.type===`rule`){a.value=(n+a.value).replaceAll(`,`,r);let e=a.props,t=[];for(let r=0;r<e.length;r++)t[r]=n+e[r];a.props=t}Array.isArray(a.children)&&a.type!==`@keyframes`&&nn(a.children,t)}return e}function rn({options:e=W,plugins:t=Ke}=W){let n,r,i,a=(e,t,i)=>i.startsWith(r)&&i.endsWith(r)&&i.replaceAll(r,``).length>0?`.${n}`:e,o=t.slice();o.push(e=>{e.type===`rule`&&e.value.includes(`&`)&&(i||=RegExp(`\\${r}\\b`,`g`),e.props[0]=e.props[0].replace($t,r).replace(i,a))}),e.prefix&&o.push(Me),o.push(ke);let s=[],c=Ae(o.concat(je(e=>s.push(e)))),l=(t,a=``,o=``,l=`&`)=>{n=l,r=a,i=void 0;let u=function(e){let t=e.indexOf(`//`)!==-1,n=e.indexOf(`}`)!==-1;if(!t&&!n)return e;if(!t)return tn(e);let r=e.length,i=``,a=0,o=0,s=0,c=0,l=0,u=!1;for(;o<r;){let t=e.charCodeAt(o);if(t!==34&&t!==39||en(e,o))if(s===0)if(t===X&&o+1<r&&e.charCodeAt(o+1)===42){for(o+=2;o+1<r&&(e.charCodeAt(o)!==42||e.charCodeAt(o+1)!==X);)o++;o+=2}else if(t!==40)if(t!==41)if(c>0)o++;else if(t===42&&o+1<r&&e.charCodeAt(o+1)===X)i+=e.substring(a,o),o+=2,a=o,u=!0;else if(t===X&&o+1<r&&e.charCodeAt(o+1)===X){for(i+=e.substring(a,o);o<r&&e.charCodeAt(o)!==10;)o++;a=o,u=!0}else t===123?l++:t===125&&l--,o++;else c>0&&c--,o++;else c++,o++;else o++;else s===0?s=t:s===t&&(s=0),o++}return u?(a<r&&(i+=e.substring(a)),l===0?i:tn(i)):l===0?e:tn(e)}(t),d=Se(o||a?o+` `+a+` { `+u+` }`:u);return e.namespace&&(d=nn(d,e.namespace)),s=[],Oe(d,c),s},u=e,d=et;for(let e=0;e<t.length;e++)t[e].name||H(15),d=G(d,t[e].name);return u!=null&&u.namespace&&(d=G(d,u.namespace)),u!=null&&u.prefix&&(d=G(d,`p`)),l.hash=d===et?``:d.toString(),l}var an=new zt,on=rn(),sn=z.createContext({shouldForwardProp:void 0,styleSheet:an,stylis:on,stylisPlugins:void 0});sn.Consumer;function cn(){return z.useContext(sn)}var ln=z.createContext(void 0);ln.Consumer;var un=Object.prototype.hasOwnProperty,dn={};function fn(e,t){let n=typeof e==`string`?Xe(e):`sc`;dn[n]=(dn[n]||0)+1;let r=n+`-`+nt(Fe+n+dn[n]);return t?t+`-`+r:r}function pn(e,t,n){let r=xt(e),i=e,a=!it(e),{attrs:o=Ke,componentId:s=fn(t.displayName,t.parentComponentId),displayName:c=at(e)}=t,l=t.displayName&&t.componentId?Xe(t.displayName)+`-`+t.componentId:t.componentId||s,u=r&&i.attrs?i.attrs.concat(o).filter(Boolean):o,{shouldForwardProp:d}=t;if(r&&i.shouldForwardProp){let e=i.shouldForwardProp;if(t.shouldForwardProp){let n=t.shouldForwardProp;d=(t,r)=>e(t,r)&&n(t,r)}else d=e}let f=new Qt(n,l,r?i.componentStyle:void 0);function p(e,t){return function(e,t,n){let{attrs:r,componentStyle:i,defaultProps:a,foldedComponentIds:o,styledComponentId:s,target:c}=e,l=z.useContext(ln),u=cn(),d=e.shouldForwardProp||u.shouldForwardProp,f=qe(t,l,a)||W,p,m;{let e=z.useRef(null),n=e.current;if(n!==null&&n[1]===f&&n[2]===u.styleSheet&&n[3]===u.stylis&&n[7]===i&&function(e,t,n){let r=e,i=t,a=0;for(let e in i)if(un.call(i,e)&&(a++,r[e]!==i[e]))return!1;return a===n}(n[0],t,n[4]))p=n[5],m=n[6];else{p=function(e,t,n){let r=Object.assign(Object.assign({},t),{className:void 0,theme:n}),i=e.length>1;for(let n=0;n<e.length;n++){let a=e[n],o=K(a)?a(i?Object.assign({},r):r):a;for(let e in o)e===`className`?r.className=q(r.className,o[e]):e===`style`?r.style=Object.assign(Object.assign({},r.style),o[e]):e in t&&t[e]===void 0||(r[e]=o[e])}return`className`in t&&typeof t.className==`string`&&(r.className=q(r.className,t.className)),r}(r,t,f),m=function(e,t,n,r){return e.generateAndInjectStyles(t,n,r)}(i,p,u.styleSheet,u.stylis);let n=0;for(let e in t)un.call(t,e)&&n++;e.current=[t,f,u.styleSheet,u.stylis,n,p,m,i]}}let h=p.as||c,g=function(e,t,n,r){let i={};for(let a in e)e[a]===void 0||a[0]===`$`||a===`as`||a===`theme`&&e.theme===n||(a===`forwardedAs`?i.as=e.forwardedAs:r&&!r(a,t)||(i[a]=e[a]));return i}(p,h,f,d),_=q(o,s);return m&&(_+=` `+m),p.className&&(_+=` `+p.className),g[it(h)&&h.includes(`-`)?`class`:`className`]=_,n&&(g.ref=n),(0,z.createElement)(h,g)}(m,e,t)}p.displayName=c;let m=z.forwardRef(p);return m.attrs=u,m.componentStyle=f,m.displayName=c,m.shouldForwardProp=d,m.foldedComponentIds=r?q(i.foldedComponentIds,i.styledComponentId):``,m.styledComponentId=l,m.target=r?i.target:e,Object.defineProperty(m,"defaultProps",{get(){return this._foldedDefaultProps},set(e){this._foldedDefaultProps=r?function(e,...t){for(let n of t)Ct(e,n,!0);return e}({},i.defaultProps,e):e}}),wt(m,()=>`.${m.styledComponentId}`),a&&yt(m,e,{attrs:!0,componentStyle:!0,displayName:!0,foldedComponentIds:!0,shouldForwardProp:!0,styledComponentId:!0,target:!0}),m}var mn=new Set(`a.abbr.address.area.article.aside.audio.b.bdi.bdo.blockquote.body.button.br.canvas.caption.cite.code.col.colgroup.data.datalist.dd.del.details.dfn.dialog.div.dl.dt.em.embed.fieldset.figcaption.figure.footer.form.h1.h2.h3.h4.h5.h6.header.hgroup.hr.html.i.iframe.img.input.ins.kbd.label.legend.li.main.map.mark.menu.meter.nav.object.ol.optgroup.option.output.p.picture.pre.progress.q.rp.rt.ruby.s.samp.search.section.select.slot.small.span.strong.sub.summary.sup.table.tbody.td.template.textarea.tfoot.th.thead.time.tr.u.ul.var.video.wbr.circle.clipPath.defs.ellipse.feBlend.feColorMatrix.feComponentTransfer.feComposite.feConvolveMatrix.feDiffuseLighting.feDisplacementMap.feDistantLight.feDropShadow.feFlood.feFuncA.feFuncB.feFuncG.feFuncR.feGaussianBlur.feImage.feMerge.feMergeNode.feMorphology.feOffset.fePointLight.feSpecularLighting.feSpotLight.feTile.feTurbulence.filter.foreignObject.g.image.line.linearGradient.marker.mask.path.pattern.polygon.polyline.radialGradient.rect.stop.svg.switch.symbol.text.textPath.tspan.use`.split(`.`));function hn(e,t){let n=[e[0]];for(let r=0,i=t.length;r<i;r+=1)n.push(t[r],e[r+1]);return n}var gn=e=>(Bt.add(e),e);function _n(e,...t){if(K(e)||J(e))return gn(Z(hn(Ke,[e,...t])));let n=e;return t.length===0&&n.length===1&&typeof n[0]==`string`?Z(n):gn(Z(hn(n,t)))}function vn(e,t,n=W){if(!t)throw H(1,t);let r=(r,...i)=>e(t,n,_n(r,...i));return r.attrs=r=>vn(e,t,Object.assign(Object.assign({},n),{attrs:Array.prototype.concat(n.attrs,r).filter(Boolean)})),r.withConfig=r=>vn(e,t,Object.assign(Object.assign({},n),r)),r}var yn=e=>vn(pn,e),Q=yn;mn.forEach(e=>{Q[e]=yn(e)});var bn=class{constructor(e,t){this.instanceRules=new Map,this.rules=e,this.componentId=t,this.isStatic=function(e){for(let t=0;t<e.length;t+=1){let n=e[t];if(K(n)&&!xt(n))return!1}return!0}(e),zt.registerId(this.componentId)}removeStyles(e,t){this.instanceRules.delete(e),this.rebuildGroup(t)}renderStyles(e,t,n,r){let i=this.componentId;if(this.isStatic){if(n.hasNameForId(i,i+e))this.instanceRules.has(e)||this.computeRules(e,t,n,r);else{let a=this.computeRules(e,t,n,r);n.insertRules(i,a.name,a.rules)}return}let a=this.instanceRules.get(e);if(this.computeRules(e,t,n,r),!n.server&&a){let t=a.rules,n=this.instanceRules.get(e).rules;if(t.length===n.length){let e=!0;for(let r=0;r<t.length;r++)if(t[r]!==n[r]){e=!1;break}if(e)return}}this.rebuildGroup(n)}computeRules(e,t,n,r){let i=St(Z(this.rules,t,n,r)),a={name:this.componentId+e,rules:r(i,``)};return this.instanceRules.set(e,a),a}rebuildGroup(e){let t=this.componentId;e.clearRules(t);for(let n of this.instanceRules.values())e.insertRules(t,n.name,n.rules)}};function xn(e,...t){let n=_n(e,...t),r=`sc-global-${nt(JSON.stringify(n))}`,i=new bn(n,r),a=e=>{let t=cn(),n=z.useContext(ln),a;{let e=z.useRef(null);e.current===null&&(e.current=t.styleSheet.allocateGSInstance(r)),a=e.current}t.styleSheet.server&&o(a,e,t.styleSheet,n,t.stylis);{let s=i.isStatic?[a,t.styleSheet,i]:[a,e,t.styleSheet,n,t.stylis,i],c=z.useRef(i);z.useLayoutEffect(()=>{t.styleSheet.server||(c.current!==i&&(t.styleSheet.clearRules(r),c.current=i),o(a,e,t.styleSheet,n,t.stylis))},s),z.useLayoutEffect(()=>()=>{t.styleSheet.server||i.removeStyles(a,t.styleSheet)},[a,t.styleSheet,i])}return t.styleSheet.server&&i.instanceRules.delete(a),null};function o(e,t,n,r,o){if(i.isStatic)i.renderStyles(e,Be,n,o);else{let s=Object.assign(Object.assign({},t),{theme:qe(t,r,a.defaultProps)});i.renderStyles(e,s,n,o)}}return z.memo(a)}var Sn,Cn=class{constructor(e,t){this[Sn]=!0,this.inject=(e,t=on)=>{let n=this.getName(t);if(!e.hasNameForId(this.id,n)){let r=t(this.rules,n,`@keyframes`);e.insertRules(this.id,n,r)}},this.name=e,this.id=ze+e,this.rules=t,U(this.id),wt(this,()=>{throw H(12,String(this.name))})}getName(e=on){return e.hash?this.name+$e(e.hash>>>0):this.name}};function wn(e,...t){let n=St(_n(e,...t));return new Cn(nt(n),n)}Sn=Wt,`${B}`,`${B}`,`${B}`;var $=n(),Tn=e=>{let[t,n]=(0,z.useState)(`auto`);return(0,z.useEffect)((()=>{let t=new ResizeObserver((e=>{n(e[0]?.contentRect.height??`auto`)}));return e.current&&t.observe(e.current),()=>{e.current&&t.unobserve(e.current)}}),[e.current]),t},En=Q.div`
  text-align: left;
  flex-grow: 1;
`,Dn=Q.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  flex-grow: 1;
`,On=Q.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  /* for Internet Explorer, Edge */
  -ms-overflow-style: none;

  /* for Firefox */
  scrollbar-width: none;

  /* for Chrome, Safari, and Opera */
  &::-webkit-scrollbar {
    display: none;
  }
`,kn=Q(On)`
  ${e=>e.$colorScheme===`light`?`background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0.06)) bottom;`:e.$colorScheme===`dark`?`background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.06)) bottom;`:void 0}

  background-repeat: no-repeat;
  background-size:
    100% 32px,
    100% 16px;
  background-attachment: local, scroll;
  max-height: 400px;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 3px;
`,An=_n`
  && {
    width: 100%;
    font-size: 16px;
    line-height: 24px;
    min-height: 56px;

    /* Tablet and Up */
    @media (min-width: 440px) {
      font-size: 14px;
    }

    display: flex;
    gap: 12px;
    align-items: center;
    color: var(--privy-color-foreground);

    padding: 10px 12px;
    border: 1px solid var(--privy-color-foreground-4) !important;
    border-radius: var(--privy-border-radius-md);
    transition: background-color 200ms ease;

    cursor: pointer;

    &:hover {
      background-color: var(--privy-color-background-2);
    }

    &:disabled {
      cursor: pointer;
      background-color: var(--privy-color-background-2);
    }
  }
`,jn=Q.div`
  text-align: center;
  font-size: 14px;
  margin-bottom: 24px;
`,Mn=Q.button.attrs({className:`login-method-button`})`
  ${An}
`;Q.a`
  ${An}
`;var Nn=Q.div`
  width: 32px;
  height: 32px;
  border-radius: ${e=>e.$fullSize?`0`:`4px`};
  background: ${e=>e.$fullSize?`transparent`:`var(--privy-color-background-2)`};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: ${e=>e.$fullSize?`32px`:`18px`};
    height: ${e=>e.$fullSize?`32px`:`18px`};
    color: ${e=>e.$fullSize?`inherit`:`var(--privy-color-icon-muted)`};
  }
`,Pn=Q.div`
  width: 100%;
  height: 100%;
  min-height: inherit;
  display: flex;
  flex-direction: column;
  ${e=>e.$if?`display: none;`:``}
`,Fn=Q.div`
  width: 100%;
  height: 100%;
  padding: ${e=>e.$withPadding?`64px 0px`:`0px`};
`,In=Q.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
  gap: 12px;
  & h3 {
    font-size: 18px;
    font-style: normal;
    font-weight: 600;
    line-height: 24px;
  }
  & p {
    max-width: 300px;
    font-size: 14px;
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }
`,Ln=({success:e,fail:t})=>(0,$.jsxs)(zn,{children:[(0,$.jsx)(Rn,{children:(0,$.jsx)(Vn,{className:e?`success`:t?`fail`:``})}),(0,$.jsx)(Rn,{children:(0,$.jsx)(Bn,{className:e?`success`:t?`fail`:``})})]}),Rn=Q.span`
  && {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
  }
`,zn=Q.span`
  position: relative;
  width: 82px;
  height: 82px;
  display: inline-block;
`,Bn=Q.span`
  && {
    width: 82px;
    height: 82px;
    border-width: 4px;
    border-style: solid;
    border-color: ${e=>e.color??`var(--privy-color-icon-subtle)`};
    border-bottom-color: transparent;
    border-radius: 50%;
    display: inline-block;
    box-sizing: border-box;
    animation: rotation 1.2s linear infinite;
    transition: border-color 800ms;
  }

  @keyframes rotation {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  &&&.success {
    border-color: var(--privy-color-icon-success);
    border-bottom-color: var(--privy-color-icon-success);
  }

  &&&.fail {
    border-color: var(--privy-color-icon-error);
    border-bottom-color: var(--privy-color-icon-error);
  }
`,Vn=Q(Bn)`
  && {
    border-bottom-color: ${e=>e.color??`var(--privy-color-border-default)`};
    border-color: ${e=>e.color??`var(--privy-color-border-default)`};
    animation: none;
    opacity: 0.5;
  }
`,Hn=e=>(0,$.jsx)(Un,{color:e.color||`var(--privy-color-foreground-3)`}),Un=Q(Bn)`
  && {
    height: 1rem;
    width: 1rem;
    margin: 2px 0;
    border-width: 1.5px;

    /* Override default Loader to match button transitions */
    transition: border-color 200ms ease;
  }
`;async function Wn(e,t,n){if(!t.shouldEnforceDefaultChainOnConnect)return;let o=Number(e.chainId.replace(`eip155:`,``));if(!t.chains.find((e=>e.id===o))&&(e.connectorType!==`wallet_connect_v2`||e.walletClientType!==`metamask`)){n?.();try{await e.switchChain(t.defaultChain.id),e.chainId=a(r(t.defaultChain.id))}catch{i.warn(`Unable to switch to default chain after connect`,{chainId:t.defaultChain.id})}}}var Gn=(0,z.createContext)({}),Kn=({children:e})=>{let t=d(),[n,r]=(0,z.useState)({});return u(`login`,{onComplete:({loginAccount:e})=>{e&&e.type!==`passkey`&&e.type!==`cross_app`&&(e.type!==`wallet`||e.walletClientType!==`privy`)&&(o.put(qn(t.id),e.type),e.type===`wallet`?(o.put(Jn(t.id),e.walletClientType),o.put(Yn(t.id),e.chainType),r({accountType:e.type,walletClientType:e.walletClientType,chainType:e.chainType})):(o.del(Jn(t.id)),o.del(Yn(t.id)),r({accountType:e.type})))}}),(0,z.useEffect)((()=>{if(!t.id)return;let e=o.get(qn(t.id)),n=o.get(Jn(t.id)),i=o.get(Yn(t.id));e&&r(e===`wallet`?{accountType:e,walletClientType:n,chainType:i}:{accountType:e})}),[t.id]),(0,$.jsx)(Gn.Provider,{value:n,children:e})},qn=e=>`privy:${e}:recent-login-method`,Jn=e=>`privy:${e}:recent-login-wallet-client`,Yn=e=>`privy:${e}:recent-login-chain-type`,Xn=()=>(0,z.useContext)(Gn),Zn=e=>{u(`fundWallet`,e);let{fundWallet:t}=l();return{fundWallet:({address:e,options:n})=>t(e,n)}};function Qn(e){let{login:t}=(0,z.useContext)(c);return u(`login`,e),{login:t}}function $n(e){let{logout:t}=(0,z.useContext)(c);return u(`logout`,e),{logout:t}}function er(e){let{connectWallet:t}=(0,z.useContext)(c);return u(`connectWallet`,e),{connectWallet:t}}var tr=s((()=>({isModalOpen:!1,resolvers:null})));s((()=>({})));var nr=({address:e,client:t,appId:n})=>{let r=`${t}:${e}`;n&&o.put(rr(n),r),tr.setState({wallet:r})},rr=e=>`privy:${e}:active-wallet-connection`;export{nr as C,Q as D,_n as E,kn as S,xn as T,Qn as _,Pn as a,er as b,Xn as c,Mn as d,In as f,Hn as g,On as h,Dn as i,Vn as l,En as m,Ln as n,Kn as o,Zn as p,Wn as r,jn as s,Tn as t,Fn as u,Nn as v,wn as w,Bn as x,$n as y};