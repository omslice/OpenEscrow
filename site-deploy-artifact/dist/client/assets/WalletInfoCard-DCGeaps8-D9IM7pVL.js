import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{D as r}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as i}from"./check-BKf5mJO2.js";import{t as a}from"./copy-D5It9dzR.js";import{t as o}from"./ModalHeader-CAqKnddp-BOAYq9Ae.js";import{t as s}from"./ErrorMessage-D8VaAP5m-BHdRttjr.js";import{t as c}from"./shared-FM0rljBt-D9yA8Cun.js";import{t as l}from"./Address-BNlptHuN-DzxONsPA.js";import{t as u}from"./LabelXs-oqZNqbm_-BLNNsRZQ.js";var d=n(),f=e(t(),1),p=r(c)`
  && {
    padding: 0.75rem;
    height: 56px;
  }
`,m=r.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,h=r.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`,g=r.div`
  font-size: 12px;
  line-height: 1rem;
  color: var(--privy-color-foreground-3);
`,_=r(u)`
  text-align: left;
  margin-bottom: 0.5rem;
`,v=r(s)`
  margin-top: 0.25rem;
`,y=r(o)`
  && {
    gap: 0.375rem;
    font-size: 14px;
  }
`,b=({errMsg:e,balance:t,address:n,className:r,title:o,showCopyButton:s=!1})=>{let[c,u]=(0,f.useState)(!1);return(0,f.useEffect)((()=>{if(c){let e=setTimeout((()=>u(!1)),3e3);return()=>clearTimeout(e)}}),[c]),(0,d.jsxs)(`div`,{children:[o&&(0,d.jsx)(_,{children:o}),(0,d.jsx)(p,{className:r,$state:e?`error`:void 0,children:(0,d.jsxs)(m,{children:[(0,d.jsxs)(h,{children:[(0,d.jsx)(l,{address:n,showCopyIcon:!1}),t!==void 0&&(0,d.jsx)(g,{children:t})]}),s&&(0,d.jsx)(y,{onClick:function(e){e.stopPropagation(),navigator.clipboard.writeText(n).then((()=>u(!0))).catch(console.error)},size:`sm`,children:(0,d.jsxs)(d.Fragment,c?{children:[`Copied`,(0,d.jsx)(i,{size:14})]}:{children:[`Copy`,(0,d.jsx)(a,{size:14})]})})]})}),e&&(0,d.jsx)(v,{children:e})]})};export{b as t};