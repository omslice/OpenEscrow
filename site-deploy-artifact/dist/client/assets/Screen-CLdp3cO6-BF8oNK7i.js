import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{D as r,n as i}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{r as a,u as o}from"./ModalHeader-CAqKnddp-BOAYq9Ae.js";import{t as s}from"./index-Dq_xe9dz-zD42MPPB.js";var c=n(),l=e(t(),1),u=r.div`
  /* spacing tokens */
  --screen-space: 16px; /* base 1x = 16 */
  --screen-space-lg: calc(var(--screen-space) * 1.5); /* 24px */

  position: relative;
  overflow: hidden;
  margin: 0 calc(-1 * var(--screen-space)); /* extends over modal padding */
  height: 100%;
  border-radius: var(--privy-border-radius-lg);
`,d=r.div`
  display: flex;
  flex-direction: column;
  gap: calc(var(--screen-space) * 1.5);
  width: 100%;
  background: var(--privy-color-background);
  padding: 0 var(--screen-space-lg) var(--screen-space);
  height: 100%;
  border-radius: var(--privy-border-radius-lg);
`,f=r.div`
  position: relative;
  display: flex;
  flex-direction: column;
`,p=r(a)`
  margin: 0 -8px;
`,m=r.div`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;

  /* Enable scrolling */
  overflow-y: auto;

  /* Hide scrollbar but keep functionality when scrollable */
  /* Add padding for focus outline space, offset with negative margin */
  padding: 3px;
  margin: -3px;

  &::-webkit-scrollbar {
    display: none;
  }
  scrollbar-gutter: stable both-edges;
  scrollbar-width: none;
  -ms-overflow-style: none;

  /* Gradient effect for scroll indication */
  ${({$colorScheme:e})=>e===`light`?`background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(0, 0, 0, 0) 20%, rgba(0, 0, 0, 0.06)) bottom;`:e===`dark`?`background: linear-gradient(var(--privy-color-background), var(--privy-color-background) 70%) bottom, linear-gradient(rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.06)) bottom;`:void 0}

  background-repeat: no-repeat;
  background-size:
    100% 32px,
    100% 16px;
  background-attachment: local, scroll;
`,h=r.div`
  display: flex;
  flex-direction: column;
  gap: var(--screen-space-lg);
  margin-top: 1.5rem;
`,g=r.div`
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--screen-space);
`,_=r.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`,v=r.h3`
  && {
    font-size: 20px;
    line-height: 32px;
    font-weight: 500;
    color: var(--privy-color-foreground);
    margin: 0;
  }
`,y=r.p`
  && {
    margin: 0;
    font-size: 16px;
    font-weight: 300;
    line-height: 24px;
    color: var(--privy-color-foreground);
  }
`,b=r.div`
  background: ${({$variant:e})=>{switch(e){case`success`:return`var(--privy-color-success-bg, #EAFCEF)`;case`warning`:return`var(--privy-color-warn, #FEF3C7)`;case`error`:return`var(--privy-color-error-bg, #FEE2E2)`;case`loading`:case`logo`:return`transparent`;default:return`var(--privy-color-background-2)`}}};

  border-radius: 50%;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
`,x=r.div`
  display: flex;
  align-items: center;
  justify-content: center;

  img,
  svg {
    max-height: 90px;
    max-width: 180px;
  }
`,S=r.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 82px;

  > div {
    position: relative;
  }

  > div > :first-child {
    position: relative;
  }

  > div > :last-child {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
  }
`,C=({children:e,...t})=>(0,c.jsx)(u,{children:(0,c.jsx)(d,{...t,children:e})}),w=r.div`
  position: absolute;
  top: 0;
  left: calc(-1 * var(--screen-space-lg));
  width: calc(100% + calc(var(--screen-space-lg) * 2));
  height: 4px;
  background: var(--privy-color-background-2);
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
  overflow: hidden;
`,T=r(o)`
  padding: 0;
  && a {
    padding: 0;
    color: var(--privy-color-foreground-3);
  }
`,E=r.div`
  height: 100%;
  width: ${({pct:e})=>e}%;
  background: var(--privy-color-foreground-3);
  border-radius: 2px;
  transition: width 300ms ease-in-out;
`,D=({step:e})=>e?(0,c.jsx)(w,{children:(0,c.jsx)(E,{pct:Math.min(100,e.current/e.total*100)})}):null;C.Header=({title:e,subtitle:t,icon:n,iconVariant:r,iconLoadingStatus:i,showBack:a,onBack:o,showInfo:s,onInfo:l,showClose:u,onClose:d,step:m,headerTitle:h,eyebrow:b,...x})=>(0,c.jsxs)(f,{...x,children:[(0,c.jsx)(p,{backFn:a?o:void 0,infoFn:s?l:void 0,onClose:u?d:void 0,title:h,eyebrow:b,closeable:u}),(n||r||e||t)&&(0,c.jsxs)(g,{children:[n||r?(0,c.jsx)(C.Icon,{icon:n,variant:r,loadingStatus:i}):null,!(!e&&!t)&&(0,c.jsxs)(_,{children:[e&&(0,c.jsx)(v,{children:e}),t&&(0,c.jsx)(y,{children:t})]})]}),m&&(0,c.jsx)(D,{step:m})]}),(C.Body=l.forwardRef((({children:e,...t},n)=>(0,c.jsx)(m,{ref:n,...t,children:e})))).displayName=`Screen.Body`,C.Footer=({children:e,...t})=>(0,c.jsx)(h,{id:`privy-content-footer-container`,...t,children:e}),C.Actions=({children:e,...t})=>(0,c.jsx)(O,{...t,children:e}),C.HelpText=({children:e,...t})=>(0,c.jsx)(k,{...t,children:e}),C.FooterText=({children:e,...t})=>(0,c.jsx)(A,{...t,children:e}),C.Watermark=()=>(0,c.jsx)(T,{}),C.Icon=({icon:e,variant:t=`subtle`,loadingStatus:n})=>t===`logo`&&e?(0,c.jsx)(x,typeof e==`string`?{children:(0,c.jsx)(`img`,{src:e,alt:``})}:l.isValidElement(e)?{children:e}:{children:l.createElement(e)}):t===`loading`?e?(0,c.jsx)(S,{children:(0,c.jsxs)(`div`,{style:{display:`flex`,alignItems:`center`,justifyContent:`center`},children:[(0,c.jsx)(i,{success:n?.success,fail:n?.fail}),typeof e==`string`?(0,c.jsx)(`span`,{style:{background:`url('${e}') 0 0 / contain`,height:`38px`,width:`38px`,borderRadius:`6px`,margin:`auto`,backgroundSize:`contain`}}):l.isValidElement(e)?l.cloneElement(e,{style:{width:`38px`,height:`38px`}}):l.createElement(e,{style:{width:`38px`,height:`38px`}})]})}):(0,c.jsx)(b,{$variant:t,children:(0,c.jsx)(s,{size:`64px`})}):(0,c.jsx)(b,{$variant:t,children:e&&(typeof e==`string`?(0,c.jsx)(`img`,{src:e,alt:``,style:{width:`32px`,height:`32px`,borderRadius:`6px`}}):l.isValidElement(e)?e:l.createElement(e,{width:32,height:32,stroke:(()=>{switch(t){case`success`:return`var(--privy-color-icon-success)`;case`warning`:return`var(--privy-color-icon-warning)`;case`error`:return`var(--privy-color-icon-error)`;default:return`var(--privy-color-icon-muted)`}})(),strokeWidth:2}))});var O=r.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(var(--screen-space) / 2);
`,k=r.div`
  && {
    margin: 0;
    width: 100%;
    text-align: center;
    color: var(--privy-color-foreground-2);
    font-size: 13px;
    line-height: 20px;

    & a {
      text-decoration: underline;
    }
  }
`,A=r.div`
  && {
    margin-top: -1rem;
    width: 100%;
    text-align: center;
    color: var(--privy-color-foreground-2);
    font-size: 0.6875rem; // 11px
    line-height: 1rem; // 16px
  }
`;export{C as t};