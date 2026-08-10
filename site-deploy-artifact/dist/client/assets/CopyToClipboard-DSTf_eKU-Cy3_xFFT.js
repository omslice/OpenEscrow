import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{D as r}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";var i=n(),a=e(t(),1),o=({style:e,color:t,...n})=>(0,i.jsx)(`svg`,{xmlns:`http://www.w3.org/2000/svg`,fill:`none`,viewBox:`0 0 24 24`,strokeWidth:`1.5`,stroke:t||`currentColor`,style:{height:`1.5rem`,width:`1.5rem`,...e},...n,children:(0,i.jsx)(`path`,{strokeLinecap:`round`,strokeLinejoin:`round`,d:`M4.5 12.75l6 6 9-13.5`})}),s=({color:e,...t})=>(0,i.jsx)(`svg`,{version:`1.1`,id:`Layer_1`,xmlns:`http://www.w3.org/2000/svg`,xmlnsXlink:`http://www.w3.org/1999/xlink`,x:`0px`,y:`0px`,viewBox:`0 0 115.77 122.88`,xmlSpace:`preserve`,...t,children:(0,i.jsx)(`g`,{children:(0,i.jsx)(`path`,{fill:e||`currentColor`,className:`st0`,d:`M89.62,13.96v7.73h12.19h0.01v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02v0.02 v73.27v0.01h-0.02c-0.01,3.84-1.57,7.33-4.1,9.86c-2.51,2.5-5.98,4.06-9.82,4.07v0.02h-0.02h-61.7H40.1v-0.02 c-3.84-0.01-7.34-1.57-9.86-4.1c-2.5-2.51-4.06-5.98-4.07-9.82h-0.02v-0.02V92.51H13.96h-0.01v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1 c-2.5-2.51-4.06-5.98-4.07-9.82H0v-0.02V13.96v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07V0h0.02h61.7 h0.01v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02V13.96L89.62,13.96z M79.04,21.69v-7.73v-0.02h0.02 c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02h-0.01h-61.7h-0.02v-0.02c-0.91,0-1.75,0.39-2.37,1.01 c-0.61,0.61-1,1.46-1,2.37h0.02v0.01v64.59v0.02h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h0.01h12.19V35.65 v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07v-0.02h0.02H79.04L79.04,21.69z M105.18,108.92V35.65v-0.02 h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02h-0.01h-61.7h-0.02v-0.02c-0.91,0-1.75,0.39-2.37,1.01 c-0.61,0.61-1,1.46-1,2.37h0.02v0.01v73.27v0.02h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h0.01h61.7h0.02 v0.02c0.91,0,1.75-0.39,2.37-1.01c0.61-0.61,1-1.46,1-2.37h-0.02V108.92L105.18,108.92z`})})}),c=e=>{let[t,n]=(0,a.useState)(!1);return(0,i.jsxs)(l,{color:e.color,onClick:()=>{n(!0),navigator.clipboard.writeText(e.text),setTimeout((()=>n(!1)),1500)},$justCopied:t,children:[t?(0,i.jsx)(o,{style:{height:`14px`,width:`14px`},strokeWidth:`2`}):(0,i.jsx)(s,{style:{height:`14px`,width:`14px`}}),t?`Copied`:`Copy`,` `,e.itemName?e.itemName:`to Clipboard`]})},l=r.button`
  display: flex;
  align-items: center;
  gap: 6px;

  && {
    margin: 8px 2px;
    font-size: 14px;
    color: ${e=>e.$justCopied?`var(--privy-color-foreground)`:e.color||`var(--privy-color-foreground-3)`};
    font-weight: ${e=>e.$justCopied?`medium`:`normal`};
    transition: color 350ms ease;

    :focus,
    :active {
      background-color: transparent;
      border: none;
      outline: none;
      box-shadow: none;
    }

    :hover {
      color: ${e=>e.$justCopied?`var(--privy-color-foreground)`:`var(--privy-color-foreground-2)`};
    }

    :active {
      color: 'var(--privy-color-foreground)';
      font-weight: medium;
    }

    @media (max-width: 440px) {
      margin: 12px 2px;
    }
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;export{c as t};