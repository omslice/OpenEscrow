import{t as e}from"./jsx-runtime-C_813Q_z.js";import{D as t}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";var n=e(),r=t.a`
  && {
    color: ${({$variant:e})=>e===`underlined`?`var(--privy-color-foreground)`:`var(--privy-link-navigation-color, var(--privy-color-accent))`};
    font-weight: 400;
    text-decoration: ${({$variant:e})=>e===`underlined`?`underline`:`var(--privy-link-navigation-decoration, none)`};
    text-underline-offset: 4px;
    text-decoration-thickness: 1px;
    cursor: ${({$disabled:e})=>e?`not-allowed`:`pointer`};
    opacity: ${({$disabled:e})=>e?.5:1};

    font-size: ${({$size:e})=>{switch(e){case`xs`:return`12px`;case`sm`:return`14px`;default:return`16px`}}};

    line-height: ${({$size:e})=>{switch(e){case`xs`:return`18px`;case`sm`:return`22px`;default:return`24px`}}};

    transition:
      color 200ms ease,
      text-decoration-color 200ms ease,
      opacity 200ms ease;

    &:hover {
      color: ${({$variant:e,$disabled:t})=>e===`underlined`?`var(--privy-color-foreground)`:`var(--privy-link-navigation-color, var(--privy-color-accent))`};
      text-decoration: ${({$disabled:e})=>e?`none`:`underline`};
      text-underline-offset: 4px;
    }

    &:active {
      color: ${({$variant:e,$disabled:t})=>t?e===`underlined`?`var(--privy-color-foreground)`:`var(--privy-link-navigation-color, var(--privy-color-accent))`:`var(--privy-color-foreground)`};
    }

    &:focus {
      outline: none;
      box-shadow: 0 0 0 3px #949df9;
      border-radius: 2px;
    }
  }
`,i=({size:e=`md`,variant:t=`navigation`,disabled:i=!1,as:a,children:o,onClick:s,...c})=>(0,n.jsx)(r,{as:a,$size:e,$variant:t,$disabled:i,onClick:e=>{i?e.preventDefault():s?.(e)},...c,children:o});export{i as t};