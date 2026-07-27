import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{o as r}from"./events-context-BJ75xIIf-6KY42PM6.js";import"./eventemitter3-FS3ByYA1.js";import{E as i,d as a}from"./index-wGOlH2Wi-BSBRX8cq.js";import"./toViemAccount-Cy6jgXI2-BSGGclUh.js";import{C as o}from"./context-DEETNFc9-CEbnmTaX.js";import{t as s}from"./modal-context-BAV3sQpp-Bc9SzOez.js";import{D as c}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as l}from"./createLucideIcon-BT_gG4fs.js";import{t as u}from"./credit-card-lVOam4Ub.js";import{c as d,i as f,l as p,v as m}from"./styles-DgsHCTKB-CZfMqHWf.js";import{r as h}from"./styles-DVyDvTdj-DXWvA7Mm.js";var g=l(`banknote`,[[`rect`,{width:`20`,height:`12`,x:`2`,y:`6`,rx:`2`,key:`9lu3g6`}],[`circle`,{cx:`12`,cy:`12`,r:`2`,key:`1c9p78`}],[`path`,{d:`M6 12h.01M18 12h.01`,key:`113zkx`}]]),_=n(),v=e(t(),1);r();var y={component:()=>{let e=i(),{onUserCloseViaDialogOrKeybindRef:t}=s(),n=o(),r=(0,v.useRef)(!1);(0,v.useEffect)((()=>{e&&(r.current=!1)}),[e]);let c=(0,v.useCallback)((async()=>{!r.current&&e&&(r.current=!0,a(),await e.onCancel())}),[e]);return(0,v.useEffect)((()=>(t.current=c,()=>{t.current===c&&(t.current=null)})),[c,t]),e?e.error?(0,_.jsx)(d,{icon:g,iconVariant:`warning`,title:`Unable to add funds`,subtitle:e.error,showClose:!0,onClose:c,primaryCta:{label:`Close`,onClick:c}}):(0,_.jsx)(d,{icon:g,iconVariant:`subtle`,title:`Select method`,subtitle:`Choose how to fund your wallet`,showClose:!0,onClose:c,children:(0,_.jsxs)(h,{style:{marginTop:`1rem`},$colorScheme:n.appearance.palette.colorScheme,children:[e.startFiat&&(0,_.jsxs)(f,{onClick:async()=>{r.current||(r.current=!0,await e.startFiat?.())},children:[(0,_.jsx)(b,{children:(0,_.jsx)(u,{})}),(0,_.jsxs)(x,{children:[(0,_.jsx)(p,{children:`Pay with fiat`}),(0,_.jsx)(S,{children:`Apple Pay, Google Pay, or debit card`})]})]}),e.startCrypto&&(0,_.jsxs)(f,{onClick:async()=>{r.current||(r.current=!0,await e.startCrypto?.())},children:[(0,_.jsx)(b,{children:(0,_.jsx)(m,{})}),(0,_.jsxs)(x,{children:[(0,_.jsx)(p,{children:`Transfer from wallet`}),(0,_.jsx)(S,{children:`Send crypto from any wallet`})]})]})]})}):null}},b=c.span`
  width: 2rem;
  height: 2rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-2);
  color: var(--color-icon-muted, #64668b);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`,x=c.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,S=c.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--privy-color-foreground-3);
`;export{y as AddFundsSelectionScreen,y as default};