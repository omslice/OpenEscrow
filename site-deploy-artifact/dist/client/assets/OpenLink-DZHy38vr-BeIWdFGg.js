import{o as e}from"./rolldown-runtime-C_JxhDyB.js";import{n as t,t as n}from"./jsx-runtime-C_813Q_z.js";import{D as r}from"./useActiveWallet-Cid7Y-Qy-rAaH2i_I.js";var i=n(),a=e(t(),1),o=e=>{let[t,n]=(0,a.useState)(!1);return(0,i.jsx)(s,{color:e.color,href:e.url,target:`_blank`,rel:`noreferrer noopener`,onClick:()=>{n(!0),setTimeout((()=>n(!1)),1500)},justOpened:t,children:e.text})},s=r.a`
  display: flex;
  align-items: center;
  gap: 6px;

  && {
    margin: 8px 2px;
    font-size: 14px;
    color: ${e=>e.justOpened?`var(--privy-color-foreground)`:e.color||`var(--privy-color-foreground-3)`};
    font-weight: ${e=>e.justOpened?`medium`:`normal`};
    transition: color 350ms ease;

    :focus,
    :active {
      background-color: transparent;
      border: none;
      outline: none;
      box-shadow: none;
    }

    :hover {
      color: ${e=>e.justOpened?`var(--privy-color-foreground)`:`var(--privy-color-foreground-2)`};
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
`;export{o as t};