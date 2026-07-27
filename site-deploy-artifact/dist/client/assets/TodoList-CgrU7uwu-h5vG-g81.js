import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{D as r}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";import{t as i}from"./check-BKf5mJO2.js";import{t as a}from"./x-DQfYSq7S.js";var o=n(),s=e(t(),1),c=r.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 10px; /* 10px gap between items */
  padding-left: 8px; /* 8px indentation container */
`;r.div`
  &&& {
    margin-left: 6px; /* Center the line under the checkbox (12px/2) */
    border-left: 2px solid var(--privy-color-foreground-4);
    height: 10px; /* 10px H padding between paragraphs */
    margin-top: 0;
    margin-bottom: 0;
  }
`;var l=({children:e,variant:t=`default`,icon:n})=>{let r=()=>{switch(t){case`success`:return`var(--privy-color-icon-success)`;case`error`:return`var(--privy-color-icon-error)`;default:return`var(--privy-color-icon-muted)`}};return(0,o.jsxs)(d,{children:[(0,o.jsx)(u,{$variant:t,"data-variant":t,children:(()=>{if(n)return s.isValidElement(n)?s.cloneElement(n,{stroke:r(),strokeWidth:2}):n;switch(t){case`success`:default:return(0,o.jsx)(i,{size:12,stroke:r(),strokeWidth:3});case`error`:return(0,o.jsx)(a,{size:12,stroke:r(),strokeWidth:3})}})()}),e]})},u=r.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: ${({$variant:e})=>{switch(e){case`success`:return`var(--privy-color-success-bg, #EAFCEF)`;case`error`:return`var(--privy-color-error-bg, #FEE2E2)`;default:return`var(--privy-color-background-2)`}}};
  flex-shrink: 0;
`,d=r.div`
  display: flex;
  justify-content: flex-start;
  align-items: flex-start; /* Align all elements to the top */
  text-align: left;
  gap: 8px;

  && {
    a {
      color: var(--privy-color-accent);
    }
  }
`;export{l as n,c as t};