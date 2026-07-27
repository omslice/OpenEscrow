import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{W as r}from"./index-wGOlH2Wi-BSBRX8cq.js";import{t as i}from"./chevron-down-DBDGRTRA.js";import{D as a}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as o}from"./ScreenLayout-Yoa2TSpi-CHz-36XH.js";var s=n(),c=e(t(),1),l=({currency:e=`usd`,value:t,onChange:n,inputMode:i=`decimal`,autoFocus:a})=>{let[o,l]=(0,c.useState)(`0`),[u,h]=(0,c.useState)(null),g=(0,c.useRef)(null),_=(0,c.useRef)(null),v=t??o,y=r[e]?.symbol??`$`,b=v.length>9?`small`:v.length>6?`compact`:`default`;(0,c.useLayoutEffect)((()=>{let e=_.current?.offsetWidth;h(e?Math.ceil(e)+2:null)}),[b,v]);let x=(0,c.useCallback)((e=>{let t=e.target.value,r=(t=t.replace(/[^\d.]/g,``)).split(`.`);r.length>2&&(t=r[0]+`.`+r.slice(1).join(``));let[i=``,a]=t.split(`.`),o=i.replace(/^0+(?=\d)/,``);((t=a===void 0?o||`0`:`${o||`0`}.${a}`)===``||t===`.`)&&(t=`0`),n?n(t):l(t)}),[n]),S=(0,c.useCallback)((e=>{!([`Delete`,`Backspace`,`Tab`,`Escape`,`Enter`,`.`,`ArrowLeft`,`ArrowRight`,`ArrowUp`,`ArrowDown`,`Home`,`End`].includes(e.key)||(e.ctrlKey||e.metaKey)&&[`a`,`c`,`v`,`x`].includes(e.key.toLowerCase()))&&(e.key>=`0`&&e.key<=`9`||e.preventDefault())}),[]);return(0,s.jsxs)(d,{$size:b,onClick:()=>g.current?.focus(),children:[(0,s.jsx)(m,{$size:b,children:y}),(0,s.jsx)(f,{ref:g,type:`text`,inputMode:i,value:v,onChange:x,onKeyDown:S,autoFocus:a,placeholder:`0`,"aria-label":`Amount`,style:u?{width:`${u}px`}:void 0}),(0,s.jsx)(p,{ref:_,"aria-hidden":`true`,children:v}),(0,s.jsx)(m,{$size:b,style:{opacity:0},children:y})]})},u=({selectedAsset:e,onEditSourceAsset:t})=>{let{icon:n}=r[e];return(0,s.jsxs)(h,{onClick:t,children:[(0,s.jsx)(g,{children:n}),(0,s.jsx)(_,{children:e.toLocaleUpperCase()}),(0,s.jsx)(v,{children:(0,s.jsx)(i,{})})]})},d=a.span`
  position: relative;
  background-color: var(--privy-color-background);
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  font-kerning: none;
  font-feature-settings: 'calt' off;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  cursor: pointer;

  && {
    color: var(--privy-color-foreground);
    font-size: ${({$size:e})=>e===`small`?`2.25rem`:e===`compact`?`3rem`:`3.75rem`};
    font-style: normal;
    font-weight: 600;
    line-height: 5.375rem;
  }
`,f=a.input`
  appearance: none;
  align-self: flex-start;
  min-width: 1ch;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  text-align: left;
  caret-color: currentColor;

  &:focus {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
  }
`,p=a.span`
  position: absolute;
  visibility: hidden;
  white-space: pre;
  pointer-events: none;
`,m=a.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;
  font-size: ${({$size:e})=>e===`small`?`0.75rem`:e===`compact`?`0.875rem`:`1rem`};
  font-style: normal;
  font-weight: 600;
  line-height: 1.5rem;
  margin-top: 0.75rem;
`,h=a.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: auto;
  gap: 0.5rem;
  border: 1px solid var(--privy-color-border-default);
  border-radius: var(--privy-border-radius-full);

  && {
    margin: auto;
    padding: 0.5rem 1rem;
  }
`,g=a.div`
  svg {
    width: 1rem;
    height: 1rem;
    border-radius: var(--privy-border-radius-full);
    overflow: hidden;
    border: solid 0.1px var(--privy-color-border-default);
  }
`,_=a.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.375rem;
`,v=a.div`
  color: var(--privy-color-foreground);

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`,y=({opts:e,isLoading:t,onSelectSource:n})=>(0,s.jsx)(o,{showClose:!1,showBack:!0,onBack:()=>n(e.source.selectedAsset),title:`Select currency`,children:(0,s.jsx)(b,{children:e.source.assets.map((e=>{let{icon:i,name:a}=r[e];return(0,s.jsx)(x,{onClick:()=>n(e),disabled:t,children:(0,s.jsxs)(S,{children:[(0,s.jsx)(C,{children:i}),(0,s.jsxs)(w,{children:[(0,s.jsx)(T,{children:a}),(0,s.jsx)(E,{children:e.toLocaleUpperCase()})]})]})},e)}))})}),b=a.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  max-height: 20.875rem;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`,x=a.button`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;

  && {
    padding: 0.75rem 1rem;
  }
`,S=a.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
`,C=a.div`
  svg {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--privy-border-radius-full);
    overflow: hidden;
    border: solid 0.1px var(--privy-color-border-default);
  }
`,w=a.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
`,T=a.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
`,E=a.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.125rem;
`;export{u as n,y as r,l as t};