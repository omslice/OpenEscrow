import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{C as r}from"./context-DEETNFc9-CEbnmTaX.js";import{D as i}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as a}from"./ChevronDownIcon-Cqk5D6K_.js";import{r as o}from"./Layouts-BlFm53ED-CDCuovI9.js";import{t as s}from"./ethers-By_elEXl-EKqQljcF.js";import{i as c,r as l,t as u}from"./WalletLink-DJUxCZsH-IXK9gy_m.js";var d=n(),f=e(t(),1),p=({label:e,children:t,valueStyles:n})=>(0,d.jsxs)(m,{children:[(0,d.jsx)(`div`,{children:e}),(0,d.jsx)(h,{style:{...n},children:t})]}),m=i.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  > :first-child {
    color: var(--privy-color-foreground-3);
    text-align: left;
  }

  > :last-child {
    color: var(--privy-color-foreground-2);
    text-align: right;
  }
`,h=i.div`
  font-size: 14px;
  line-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-2);
  padding: 4px 8px;
`,g=({gas:e,tokenPrice:t,tokenSymbol:n})=>(0,d.jsxs)(o,{style:{paddingBottom:`12px`},children:[(0,d.jsxs)(v,{children:[(0,d.jsx)(b,{children:`Est. Fees`}),(0,d.jsx)(`div`,{children:(0,d.jsx)(l,{weiQuantities:[BigInt(e)],tokenPrice:t,tokenSymbol:n})})]}),t&&(0,d.jsx)(y,{children:`${s(BigInt(e),n)}`})]}),_=({value:e,gas:t,tokenPrice:n,tokenSymbol:r})=>{let i=BigInt(e??0)+BigInt(t);return(0,d.jsxs)(o,{children:[(0,d.jsxs)(v,{children:[(0,d.jsx)(b,{children:`Total (including fees)`}),(0,d.jsx)(`div`,{children:(0,d.jsx)(l,{weiQuantities:[BigInt(e||0),BigInt(t)],tokenPrice:n,tokenSymbol:r})})]}),n&&(0,d.jsx)(y,{children:s(i,r)})]})},v=i.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-top: 4px;
`,y=i.div`
  display: flex;
  flex-direction: row;
  height: 12px;

  font-size: 12px;
  line-height: 12px;
  color: var(--privy-color-foreground-3);
  font-weight: 400;
`,b=i.div`
  font-size: 14px;
  line-height: 22.4px;
  font-weight: 400;
`,x=(0,f.createContext)(void 0),S=(0,f.createContext)(void 0),C=({defaultValue:e,children:t})=>{let[n,r]=(0,f.useState)(e||null);return(0,d.jsx)(x.Provider,{value:{activePanel:n,togglePanel:e=>{r(n===e?null:e)}},children:(0,d.jsx)(O,{children:t})})},w=({value:e,children:t})=>{let{activePanel:n,togglePanel:r}=(0,f.useContext)(x),i=n===e;return(0,d.jsx)(S.Provider,{value:{onToggle:()=>r(e),value:e},children:(0,d.jsx)(M,{isActive:i?`true`:`false`,"data-open":String(i),children:t})})},T=({children:e})=>{let{activePanel:t}=(0,f.useContext)(x),{onToggle:n,value:r}=(0,f.useContext)(S),i=t===r;return(0,d.jsxs)(d.Fragment,{children:[(0,d.jsxs)(k,{onClick:n,"data-open":String(i),children:[(0,d.jsx)(j,{children:e}),(0,d.jsx)(F,{isactive:i?`true`:`false`,children:(0,d.jsx)(a,{height:`16px`,width:`16px`,strokeWidth:`2`})})]}),(0,d.jsx)(A,{})]})},E=({children:e})=>{let{activePanel:t}=(0,f.useContext)(x),{value:n}=(0,f.useContext)(S);return(0,d.jsx)(N,{"data-open":String(t===n),children:(0,d.jsx)(P,{children:e})})},D=({children:e})=>{let{activePanel:t}=(0,f.useContext)(x),{value:n}=(0,f.useContext)(S);return(0,d.jsx)(P,{children:typeof e==`function`?e({isActive:t===n}):e})},O=i.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 8px;
`,k=i.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  cursor: pointer;
  padding-bottom: 8px;
`,A=i.div`
  width: 100%;

  && {
    border-top: 1px solid;
    border-color: var(--privy-color-foreground-4);
  }
  padding-bottom: 12px;
`,j=i.div`
  font-size: 14px;
  font-weight: 500;
  line-height: 19.6px;
  width: 100%;
  padding-right: 8px;
`,M=i.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;
  padding: 12px;

  && {
    border: 1px solid;
    border-color: var(--privy-color-foreground-4);
    border-radius: var(--privy-border-radius-md);
  }
`,N=i.div`
  position: relative;
  overflow: hidden;
  transition: max-height 25ms ease-out;

  &[data-open='true'] {
    max-height: 700px;
  }

  &[data-open='false'] {
    max-height: 0;
  }
`,P=i.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 1px;
`,F=i.div`
  transform: ${e=>e.isactive===`true`?`rotate(180deg)`:`rotate(0deg)`};
`,I=({from:e,to:t,txn:n,transactionInfo:i,tokenPrice:a,gas:o,tokenSymbol:s})=>{let l=BigInt(n?.value||0);return(0,d.jsx)(C,{...r().render.standalone?{defaultValue:`details`}:{},children:(0,d.jsxs)(w,{value:`details`,children:[(0,d.jsx)(T,{children:(0,d.jsxs)(L,{children:[(0,d.jsx)(`div`,{children:i?.title||`Details`}),(0,d.jsx)(R,{children:(0,d.jsx)(c,{weiQuantities:[l],tokenPrice:a,tokenSymbol:s})})]})}),(0,d.jsxs)(E,{children:[(0,d.jsx)(p,{label:`From`,children:(0,d.jsx)(u,{walletAddress:e,chainId:n.chainId||1,chainType:`ethereum`})}),(0,d.jsx)(p,{label:`To`,children:(0,d.jsx)(u,{walletAddress:t,chainId:n.chainId||1,chainType:`ethereum`})}),i&&i.action&&(0,d.jsx)(p,{label:`Action`,children:i.action}),o&&(0,d.jsx)(g,{value:n.value,gas:o,tokenPrice:a,tokenSymbol:s})]}),(0,d.jsx)(D,{children:({isActive:e})=>(0,d.jsx)(_,{value:n.value,displayFee:e,gas:o||`0x0`,tokenPrice:a,tokenSymbol:s})})]})})},L=i.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`,R=i.div`
  flex-shrink: 0;
  padding-left: 8px;
`;export{I as t};