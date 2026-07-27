import{t as e}from"./jsx-runtime-C_813Q_z.js";import{E as t}from"./_esm-CXovkjhI.js";import{s as n}from"./events-context-BJ75xIIf-6KY42PM6.js";import{D as r}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as i}from"./getFormattedUsdFromLamports-B6EqSEho-CWXnni59.js";import{n as a}from"./transaction-CnfuREWo-D7B2_ywf.js";import{i as o,n as s,o as c,t as l}from"./ethers-By_elEXl-EKqQljcF.js";var u=e(),d=({weiQuantities:e,tokenPrice:t,tokenSymbol:n})=>{let r=o(e),i=t?c(r,t):void 0,a=l(r,n);return(0,u.jsx)(m,{children:i||a})},f=({weiQuantities:e,tokenPrice:t,tokenSymbol:n})=>{let r=o(e),i=t?c(r,t):void 0,a=l(r,n);return(0,u.jsx)(m,{children:i?(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)(h,{children:`USD`}),i===`<$0.01`?(0,u.jsxs)(_,{children:[(0,u.jsx)(g,{children:`<`}),`$0.01`]}):i]}):a})},p=({quantities:e,tokenPrice:n,tokenSymbol:r=`SOL`,tokenDecimals:o=9})=>{let s=e.reduce(((e,t)=>e+t),0n),c=n&&r===`SOL`&&o===9?i(s,n):void 0,l=r===`SOL`&&o===9?a(s):`${t(s,o)} ${r}`;return(0,u.jsx)(m,{children:c?(0,u.jsx)(u.Fragment,{children:c===`<$0.01`?(0,u.jsxs)(_,{children:[(0,u.jsx)(g,{children:`<`}),`$0.01`]}):c}):l})},m=r.span`
  font-size: 14px;
  line-height: 140%;
  display: flex;
  gap: 4px;
  align-items: center;
`,h=r.span`
  font-size: 12px;
  line-height: 12px;
  color: var(--privy-color-foreground-3);
`,g=r.span`
  font-size: 10px;
`,_=r.span`
  display: flex;
  align-items: center;
`;function v(e,t){return`https://explorer.solana.com/account/${e}?chain=${t}`}var y=e=>(0,u.jsx)(b,{href:e.chainType===`ethereum`?s(e.chainId,e.walletAddress):v(e.walletAddress,e.chainId),target:`_blank`,children:n(e.walletAddress)}),b=r.a`
  &:hover {
    text-decoration: underline;
  }
`;export{d as i,p as n,f as r,y as t};