import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{s as r}from"./events-context-BJ75xIIf-6KY42PM6.js";import{D as i}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as a}from"./check-BKf5mJO2.js";import{t as o}from"./copy-D5It9dzR.js";import{t as s}from"./ModalHeader-CAqKnddp-BOAYq9Ae.js";var c=n(),l=e(t(),1),u=({address:e,showCopyIcon:t,url:n,className:i})=>{let[u,m]=(0,l.useState)(!1);function h(t){t.stopPropagation(),navigator.clipboard.writeText(e).then((()=>m(!0))).catch(console.error)}return(0,l.useEffect)((()=>{if(u){let e=setTimeout((()=>m(!1)),3e3);return()=>clearTimeout(e)}}),[u]),(0,c.jsxs)(d,n?{children:[(0,c.jsx)(p,{title:e,className:i,href:`${n}/address/${e}`,target:`_blank`,children:r(e)}),t&&(0,c.jsx)(s,{onClick:h,size:`sm`,style:{gap:`0.375rem`},children:(0,c.jsxs)(c.Fragment,u?{children:[`Copied`,(0,c.jsx)(a,{size:16})]}:{children:[`Copy`,(0,c.jsx)(o,{size:16})]})})]}:{children:[(0,c.jsx)(f,{title:e,className:i,children:r(e)}),t&&(0,c.jsx)(s,{onClick:h,size:`sm`,style:{gap:`0.375rem`,fontSize:`14px`},children:(0,c.jsxs)(c.Fragment,u?{children:[`Copied`,(0,c.jsx)(a,{size:14})]}:{children:[`Copy`,(0,c.jsx)(o,{size:14})]})})]})},d=i.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`,f=i.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,p=i.a`
  font-size: 14px;
  color: var(--privy-color-foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;export{u as t};