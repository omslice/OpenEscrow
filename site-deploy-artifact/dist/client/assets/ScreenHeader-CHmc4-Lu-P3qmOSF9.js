import{t as e}from"./jsx-runtime-C_813Q_z.js";import{D as t}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";var n=e(),r=({title:e,description:t,children:r,...i})=>(0,n.jsx)(a,{...i,children:(0,n.jsxs)(n.Fragment,{children:[(0,n.jsx)(`h3`,{children:e}),typeof t==`string`?(0,n.jsx)(`p`,{children:t}):t,r]})});t(r)`
  margin-bottom: 24px;
`;var i=({title:e,description:t,icon:r,children:i,...a})=>(0,n.jsxs)(o,{...a,children:[r||null,(0,n.jsx)(`h3`,{children:e}),t&&typeof t==`string`?(0,n.jsx)(`p`,{children:t}):t,i]}),a=t.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  text-align: left;
  gap: 8px;
  width: 100%;
  margin-bottom: 24px;

  && h3 {
    font-size: 17px;
    color: var(--privy-color-foreground);
  }

  /* Sugar assuming children are paragraphs. Otherwise, handling styling on your own */
  && p {
    color: var(--privy-color-foreground-2);
    font-size: 14px;
  }
`,o=t(a)`
  align-items: center;
  text-align: center;
  gap: 16px;

  h3 {
    margin-bottom: 24px;
  }
`;export{i as n,r as t};