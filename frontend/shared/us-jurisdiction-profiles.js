import { buildClaimPolicy } from "./claim-policies.js";

const RESEARCH_DATE = "2026-07-26";
const PROFILE_VERSION = "rules-2026-07-26.v4";

// These are implemented, official-source-reviewed routing profiles, not legal
// conclusions. A profile's
// defaultClaimDays is the shortest generally applicable statewide
// deposit-accounting deadline identified in the cited source, or a clearly
// labeled OpenEscrow fallback where the rule is procedural or fact-dependent.
const STATE_SPECS = [
  ["AL", "Alabama", 60, 60, "Ala. Code § 35-9A-201", "https://alison.legislature.state.al.us/code-of-alabama?section=35-9A-201", "Generally one month’s rent, with listed exceptions.", "Calendar-day return and itemization period."],
  ["AK", "Alaska", 14, 14, "Alaska Stat. § 34.03.070", "https://www.akleg.gov/basis/statutes.asp#34.03.070", "Generally two months’ rent; statutory exceptions apply.", "Fourteen days can depend on compliant notice; other cases can allow 30 days."],
  ["AZ", "Arizona", 14, 14, "Ariz. Rev. Stat. § 33-1321", "https://www.azleg.gov/ars/33/01321.htm", "One and one-half months’ rent, excluding voluntary advance rent.", "Fourteen days excludes Saturdays, Sundays, and legal holidays and follows surrender plus tenant demand."],
  ["AR", "Arkansas", 60, 60, "Ark. Code §§ 18-16-301–306", "https://www.arkleg.state.ar.us/ArkansasLaw", "Generally two months’ rent when the statutory subchapter applies.", "Coverage exceptions and forwarding-address rules require review."],
  ["CA", "California", 21, 21, "Cal. Civ. Code § 1950.5", "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5.", "One month’s rent by default; a narrow small-landlord exception can allow two months.", "Includes itemization, documentation, photo, inspection, and electronic-return rules."],
  ["CO", "Colorado", 30, 30, "Colo. Rev. Stat. § 38-12-103", "https://leg.colorado.gov/sites/default/files/images/olls/crs2025-title-38.pdf", "No general statewide monetary cap identified in this research pass.", "Lease may extend the deadline, but not beyond 60 days; 30 days is the baseline."],
  ["CT", "Connecticut", 21, 21, "Conn. Gen. Stat. § 47a-21", "https://www.cga.ct.gov/current/pub/chap_831.htm#sec_47a-21", "Generally two months’ rent, reduced to one month for qualifying older tenants.", "Deadline can be the later of 21 days after termination or 15 days after receiving a forwarding address."],
  ["DE", "Delaware", 20, 20, "Del. Code tit. 25, § 5514", "https://delcode.delaware.gov/title25/c055/index.html#5514", "Generally one month’s rent for tenancies of one year or more; exceptions apply.", "Twenty-day itemization and refund period."],
  ["DC", "District of Columbia", 45, 45, "14 DCMR §§ 308–311; D.C. Code § 42-3502.17", "https://code.dccouncil.gov/us/dc/council/code/sections/42-3502.17", "Generally one month’s rent.", "The regulations use a staged 45-day notice/return process and later itemization steps."],
  ["FL", "Florida", 30, 30, "Fla. Stat. § 83.49", "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0000-0099/0083/Sections/0083.49.html", "No general statewide monetary cap identified in this research pass.", "15 days if no claim; notice of intent to claim is due within 30 days."],
  ["GA", "Georgia", 30, 30, "Ga. Code §§ 44-7-30–36", "https://consumer.georgia.gov/consumer-topics/landlord-tenant-issues-and-handbook", "No general statewide monetary cap identified in this research pass.", "Thirty-day return and itemization period; statutory coverage exceptions apply."],
  ["HI", "Hawaii", 14, 14, "Haw. Rev. Stat. § 521-44", "https://www.capitol.hawaii.gov/hrscurrent/Vol12_Ch0501-0588/HRS0521/HRS_0521-0044.htm", "Generally one month’s rent, plus a permitted pet deposit.", "Fourteen-day return and itemization period."],
  ["ID", "Idaho", 21, 21, "Idaho Code § 6-321", "https://legislature.idaho.gov/statutesrules/idstat/title6/t6ch3/sect6-321/", "No general statewide monetary cap identified in this research pass.", "21-day baseline; a lease can provide up to 30 days."],
  ["IL", "Illinois", 30, 30, "765 ILCS 710/1", "https://www.ilga.gov/legislation/ilcs/ilcs3.asp?ActID=2202&ChapterID=62", "No general statewide cap; local ordinances can be more protective.", "For covered properties, damage itemization is due in 30 days and any balance in 45 days."],
  ["IN", "Indiana", 45, 45, "Ind. Code §§ 32-31-3-12–14", "https://iga.in.gov/laws/2025/ic/titles/32#32-31-3", "No general statewide monetary cap identified in this research pass.", "Forty-five-day return and itemization period, subject to tenant address requirements."],
  ["IA", "Iowa", 30, 30, "Iowa Code § 562A.12", "https://www.legis.iowa.gov/docs/code/562A.12.pdf", "Two months’ rent.", "Thirty-day return and itemization period after termination and receipt of mailing instructions."],
  ["KS", "Kansas", 30, 30, "Kan. Stat. § 58-2550", "https://www.ksrevisor.gov/statutes/chapters/ch58/058_025_0050.html", "One month unfurnished, one and one-half months furnished, with a permitted pet increment.", "Thirty-day return and itemization period."],
  ["KY", "Kentucky", 30, 30, "Ky. Rev. Stat. § 383.580", "https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=35733", "No general statewide monetary cap identified in this research pass.", "Inspection-list, notice, forwarding-address, and 30/60-day procedures require fact-specific review."],
  ["LA", "Louisiana", 30, 30, "La. Rev. Stat. § 9:3251", "https://legis.la.gov/Legis/Law.aspx?d=107468", "No general statewide monetary cap identified in this research pass.", "One-month return and itemization period."],
  ["ME", "Maine", 21, 21, "Me. Rev. Stat. tit. 14, §§ 6032–6033", "https://legislature.maine.gov/statutes/14/title14sec6033.html", "Two months’ rent.", "21 days for tenancy at will; written leases can use up to 30 days."],
  ["MD", "Maryland", 45, 45, "Md. Code, Real Property § 8-203.1", "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=grp&section=8-203.1", "Generally one month’s rent.", "Forty-five-day return period; inspection and notice procedures also apply."],
  ["MA", "Massachusetts", 30, 30, "Mass. Gen. Laws ch. 186, § 15B", "https://malegislature.gov/Laws/GeneralLaws/PartII/TitleI/Chapter186/Section15B", "One month’s rent.", "Thirty-day return and sworn itemization period with strict account, receipt, and interest rules."],
  ["MI", "Michigan", 30, 30, "Mich. Comp. Laws §§ 554.609–.613", "https://legislature.mi.gov/Laws/MCL?objectName=mcl-554-609", "One and one-half months’ rent.", "Thirty-day damage-list process; tenant response and suit deadlines follow."],
  ["MN", "Minnesota", 21, 21, "Minn. Stat. § 504B.178", "https://www.revisor.mn.gov/statutes/cite/504B.178", "Generally one month’s rent under current statewide limits, with timing/coverage details to confirm.", "Twenty-one-day return and explanation period; shorter rules can apply after condemnation."],
  ["MS", "Mississippi", 45, 45, "Miss. Code § 89-8-21", "https://www.legislature.ms.gov/legislation/mississippi-law/", "No general statewide monetary cap identified in this research pass.", "Forty-five-day return and itemization period."],
  ["MO", "Missouri", 30, 30, "Mo. Rev. Stat. § 535.300", "https://revisor.mo.gov/main/OneSection.aspx?section=535.300", "Two months’ rent.", "Thirty-day return and itemization period; move-out inspection notice rules apply."],
  ["MT", "Montana", 30, 30, "Mont. Code §§ 70-25-202–204", "https://archive.legmt.gov/bills/mca/title_0700/chapter_0250/part_0020/section_0020/0700-0250-0020-0020.html", "No general statewide monetary cap identified in this research pass.", "Thirty-day outer deadline; a shorter return period can apply when there are no deductions."],
  ["NE", "Nebraska", 14, 14, "Neb. Rev. Stat. § 76-1416", "https://nebraskalegislature.gov/laws/statutes.php?statute=76-1416", "One month’s rent plus a permitted pet deposit.", "Fourteen-day return and itemization period after tenant demand and address delivery."],
  ["NV", "Nevada", 30, 30, "Nev. Rev. Stat. § 118A.242", "https://www.leg.state.nv.us/NRS/NRS-118A.html#NRS118ASec242", "Generally three months’ rent, including the statutory combination of security and last month’s rent.", "Thirty-day return and itemization period."],
  ["NH", "New Hampshire", 30, 30, "N.H. Rev. Stat. §§ 540-A:6–8", "https://www.gencourt.state.nh.us/rsa/html/LV/540-A/540-A-7.htm", "One month’s rent or $100, whichever is greater, subject to coverage exceptions.", "Thirty-day return and itemization period."],
  ["NJ", "New Jersey", 30, 30, "N.J. Stat. §§ 46:8-19–21.1", "https://www.nj.gov/dca/divisions/codes/publications/pdf_lti/sdepsit_law.pdf", "One and one-half months’ rent.", "Thirty-day baseline; much shorter deadlines apply to certain displacement events."],
  ["NM", "New Mexico", 30, 30, "N.M. Stat. §§ 47-8-18, 47-8-20", "https://nmonesource.com/nmos/nmsa/en/item/4371/index.do#!b/47-8-18", "One month’s rent for rental agreements shorter than one year; interest rules can apply to larger deposits.", "Thirty-day return and itemization period."],
  ["NY", "New York", 14, 14, "N.Y. Gen. Oblig. Law § 7-108", "https://www.nysenate.gov/legislation/laws/GOB/7-108", "One month’s rent for covered non-rent-stabilized units, with listed exceptions.", "Fourteen-day return and itemization period plus pre-move-out inspection rights."],
  ["NC", "North Carolina", 30, 30, "N.C. Gen. Stat. §§ 42-51–56", "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_42/GS_42-52.html", "Varies by tenancy length: two weeks, one and one-half months, or two months; pet deposits can be added.", "Thirty-day accounting; an interim accounting can extend final accounting to 60 days."],
  ["ND", "North Dakota", 30, 30, "N.D. Cent. Code § 47-16-07.1", "https://ndlegis.gov/cencode/t47c16.pdf", "Generally one month’s rent, with pet and specified risk exceptions.", "Thirty-day return and itemization period."],
  ["OH", "Ohio", 30, 30, "Ohio Rev. Code § 5321.16", "https://codes.ohio.gov/ohio-revised-code/section-5321.16", "No general statewide monetary cap identified in this research pass.", "Thirty-day return and itemization period after termination and delivery of possession."],
  ["OK", "Oklahoma", 45, 45, "Okla. Stat. tit. 41, § 115", "https://www.oscn.net/applications/oscn/DeliverDocument.asp?CiteID=71770", "No general statewide monetary cap identified in this research pass.", "Forty-five-day return period after written demand; demand and abandonment rules matter."],
  ["OR", "Oregon", 31, 31, "Or. Rev. Stat. § 90.300", "https://www.oregonlegislature.gov/bills_laws/ors/ors090.html", "No general statewide monetary cap identified in this research pass.", "Thirty-one-day return and accounting period."],
  ["PA", "Pennsylvania", 30, 30, "68 Pa. Stat. § 250.512", "https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/68/00.025..HTM", "Two months’ rent in the first year, generally one month thereafter.", "Thirty-day return and itemization period, subject to forwarding-address requirements."],
  ["RI", "Rhode Island", 20, 20, "R.I. Gen. Laws § 34-18-19", "https://webserver.rilegislature.gov/Statutes/TITLE34/34-18/34-18-19.htm", "One month’s rent.", "Twenty-day return and itemization period."],
  ["SC", "South Carolina", 30, 30, "S.C. Code § 27-40-410", "https://www.scstatehouse.gov/code/t27c040.php", "No general statewide monetary cap identified in this research pass.", "Thirty-day return and itemization period after termination, demand, and forwarding information."],
  ["SD", "South Dakota", 14, 14, "S.D. Codified Laws §§ 43-32-24–24.1", "https://sdlegislature.gov/Statutes/43-32-24", "Generally one month’s rent; special conditions can justify more.", "Two-week refund/withholding notice baseline; detailed itemization can follow within 45 days."],
  ["TN", "Tennessee", 30, null, "Tenn. Code § 66-28-301", "https://www.tn.gov/commerce/fire/residential-landlord-tenant-act.html", "No general statewide monetary cap identified in this research pass.", "The statewide process is notice- and demand-driven; 30 days is an OpenEscrow test default, not a statutory return deadline."],
  ["TX", "Texas", 30, 30, "Tex. Prop. Code §§ 92.103–.109", "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.92.htm#92.103", "No general statewide monetary cap identified in this research pass.", "Thirty-day return and itemization period after surrender, with forwarding-address and other conditions."],
  ["UT", "Utah", 30, 30, "Utah Code § 57-17-3", "https://le.utah.gov/xcode/Title57/Chapter17/57-17-S3.html", "No general statewide monetary cap identified in this research pass.", "Thirty-day return and itemization period."],
  ["VT", "Vermont", 14, 14, "Vt. Stat. tit. 9, § 4461", "https://legislature.vermont.gov/statutes/section/09/137/04461", "No general statewide monetary cap identified in this research pass; local deposit ordinances may apply.", "Fourteen-day return and itemization period; shorter rules can apply to seasonal occupancy."],
  ["VA", "Virginia", 45, 45, "Va. Code § 55.1-1226", "https://law.lis.virginia.gov/vacode/title55.1/chapter12/section55.1-1226/", "Two months’ rent.", "Forty-five-day return and itemization period, with inspection and contractor-delay procedures."],
  ["WA", "Washington", 30, 30, "Wash. Rev. Code § 59.18.280", "https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.280", "No general statewide monetary cap identified in this research pass; local rules may apply.", "Thirty-day statement and refund period under current law."],
  ["WV", "West Virginia", 60, 60, "W. Va. Code § 37-6A-1", "https://code.wvlegislature.gov/37-6A-1/", "No general statewide monetary cap identified in this research pass.", "Generally 60 days after termination, or 45 days after a later tenant takes possession, whichever is shorter."],
  ["WI", "Wisconsin", 21, 21, "Wis. Stat. § 704.28; Wis. Admin. Code ATCP § 134.06", "https://docs.legis.wisconsin.gov/statutes/statutes/704/28", "No general statewide monetary cap identified in this research pass.", "Twenty-one-day return and itemization period."],
  ["WY", "Wyoming", 30, 30, "Wyo. Stat. § 1-21-1208", "https://wyoleg.gov/statutes/compress/title01.pdf", "No general statewide monetary cap identified in this research pass.", "Thirty-day return/itemization baseline; verified damage can allow an additional 30 days."],
];

const COMMON_REQUIREMENTS = Object.freeze([
  "Classify each charge as refundable security, advance rent, or a nonrefundable fee before collecting it.",
  "Record the legally controlling end-of-tenancy, surrender, possession, demand, and forwarding-address events.",
  "Limit deductions to amounts authorized by the governing law and preserve an itemized calculation and supporting evidence.",
  "Return the undisputed balance using an authorized delivery method and retain proof of timely delivery.",
]);

const STATE_REQUIREMENTS = Object.freeze({
  AL: ["Apply the one-month cap unless a statutory pet, change, or risk exception is documented.", "Send the itemized accounting and balance within 60 days."],
  AK: ["Apply the two-month cap unless the statutory rent or pet exception applies.", "Use the 14-day path only when the landlord gave the required termination notice; otherwise use the 30-day path."],
  AZ: ["Provide the move-in condition form and notice of the tenant's move-out-inspection right.", "Count the 14-day return period without Saturdays, Sundays, or legal holidays after termination, possession, and tenant demand."],
  AR: ["Confirm whether the owner/manager coverage exception for five or fewer dwelling units applies.", "Mail the itemization and balance to the tenant's last known or supplied address within 60 days."],
  CA: ["Offer the statutory pre-move-out inspection and give the required inspection notice when requested.", "Preserve move-in, pre-repair, and post-repair photographs and the required invoices, receipts, or good-faith estimates.", "Send the itemized statement and balance within 21 days using an authorized delivery method."],
  CO: ["Apply the two-month statewide cap and separately evaluate the refundable pet-deposit limit.", "Use the lease deadline only when it is no longer than 60 days; otherwise use the 30-day baseline.", "Offer a reasonable pre-surrender walk-through when requested and preserve the written condition record.", "Do not charge for preexisting conditions or ordinary wear; provide the exact reasons, supporting documentation when required, and remaining balance."],
  CT: ["Hold the deposit in the required escrow account, provide notices, and credit statutory interest.", "Apply the later of 21 days after tenancy termination or 15 days after receiving the forwarding address."],
  DE: ["Hold security in the required federally insured account and disclose its location.", "Apply the one-month cap to covered leases of one year or more and separately evaluate pet and furnished-unit exceptions.", "Send the itemization and balance within 20 days."],
  DC: ["Apply the one-month cap, escrow requirements, disclosures, and interest rules.", "Within 45 days either return the deposit or notify the tenant of the intent to deduct; complete the later accounting stage within 30 additional days."],
  FL: ["Choose and document a compliant Florida account or surety-bond method and provide the statutory holding notice.", "Return the deposit within 15 days when making no claim, or send the statutory claim notice by certified mail within 30 days.", "Track the tenant's 15-day objection period and the remaining-balance deadline."],
  GA: ["Confirm statutory coverage and use an escrow account or qualifying surety bond.", "Complete and deliver the move-in and move-out damage lists within the statutory inspection process.", "Return the balance and itemization within 30 days."],
  HI: ["Apply the one-month cap and separately document any permitted pet deposit.", "Mail or deliver the itemization and balance within 14 days."],
  ID: ["Use the 21-day baseline unless the lease expressly provides a period no longer than 30 days.", "Provide a signed itemization and the remaining deposit."],
  IL: ["Provide the damage itemization and paid receipts, estimates, or the statutory substitute documentation within 30 days after the later of vacancy or the end of the tenant's right to possession.", "Return the full deposit within 45 days when the required damage statement and records are not furnished.", "Evaluate the separate statutory interest rule for qualifying properties and check municipal ordinances."],
  IN: ["Obtain the tenant's forwarding address in writing.", "Mail the itemized deductions and balance within 45 days."],
  IA: ["Keep the deposit in a qualifying account and apply the two-month cap.", "Return the balance and itemization within 30 days after termination and receipt of mailing instructions."],
  KS: ["Apply the correct cap for unfurnished, furnished, and pet arrangements.", "Return the balance and itemization within 30 days."],
  KY: ["Maintain the required separate account and disclose its location.", "Use signed move-in and move-out damage lists and give the tenant the statutory inspection opportunity.", "Follow the forwarding-address and unclaimed-deposit notice procedure in addition to the 30-day accounting path."],
  LA: ["Return the balance and itemized deductions within one month after the tenancy ends.", "Do not deduct for reasonable wear and tear."],
  ME: ["Hold the deposit in a qualifying account and apply the two-month cap.", "Use 21 days for a tenancy at will and no more than 30 days when a written lease sets the period."],
  MD: ["Give the statutory receipt and inspection-right notices and hold the deposit with required interest.", "Offer and document the move-in and move-out inspection procedures.", "Return the balance with the written accounting within 45 days."],
  MA: ["Do not collect more than one month's rent as security and issue every required receipt.", "Use a compliant Massachusetts interest-bearing account and provide the bank/account notice.", "Provide the statement of condition and, after termination, a sworn itemization with supporting records and balance within 30 days."],
  MI: ["Use a regulated account or surety bond, provide the statutory notice, and supply inventory checklists.", "Send the damage list within 30 days, track the tenant's seven-day response, and track the landlord's 45-day action deadline after a dispute."],
  MN: ["Credit one percent simple annual interest and obtain mailing or delivery instructions.", "Give the statutory initial- and move-out-inspection notices and perform requested inspections.", "Return the balance or written withholding explanation within 21 days, or five days after qualifying condemnation."],
  MS: ["Return the itemized deductions and balance within 45 days after the tenancy ends.", "Exclude ordinary wear and tear from deductions."],
  MO: ["Apply the two-month cap and hold the deposit in a qualifying financial institution.", "Give reasonable notice of the move-out inspection and allow the tenant to attend.", "Return the itemized deductions and balance within 30 days."],
  MT: ["Provide the statutory cleaning notice and opportunity to cure when required.", "Return the full deposit within 10 days when there are no deductions; otherwise provide the accounting and balance within 30 days."],
  NE: ["Apply the one-month cap and separately evaluate the permitted pet deposit.", "After tenant demand and address delivery, return the itemization and balance within 14 days."],
  NV: ["Apply the combined three-month limit to security and last month's rent and evaluate surety-bond alternatives.", "Provide the itemization and remaining deposit within 30 days."],
  NH: ["Confirm statutory coverage, including owner-occupied and unit-count exceptions.", "Issue the receipt and hold covered deposits as required, including interest where applicable.", "Return the itemization and balance within 30 days."],
  NJ: ["Apply the one-and-one-half-month cap, compliant investment/account rules, annual interest handling, and notices.", "Use the 30-day baseline and evaluate accelerated deadlines for fire, flood, condemnation, displacement, or protected lease termination."],
  NM: ["Apply the one-month cap to leases shorter than one year and calculate interest when the statute permits a larger deposit.", "Return the itemization and balance within 30 days."],
  NY: ["Apply the one-month cap only after resolving the statute's unit and program coverage.", "Offer the beginning-of-tenancy inspection and the pre-vacatur inspection with at least 48 hours' notice.", "Send the itemization and balance within 14 days; late itemization can forfeit retention rights."],
  NC: ["Apply the tenancy-length cap and separately evaluate a reasonable nonrefundable pet fee.", "Hold the deposit in a trust account or use a qualifying bond and provide the required notice.", "Account within 30 days, using an interim accounting only when final damages cannot be determined and completing it by 60 days."],
  ND: ["Apply the one-month baseline while separately evaluating pet and statutory risk exceptions.", "Credit required interest for qualifying tenancies and return the accounting and balance within 30 days."],
  OH: ["After termination and delivery of possession, send the itemization and balance within 30 days.", "Use the forwarding address supplied by the tenant and separately calculate required interest on qualifying long-held excess deposits."],
  OK: ["Hold the deposit in the required escrow account.", "Track the tenant's written demand; return the deposit within 45 days after demand and apply the statutory abandonment procedure when no timely demand is made."],
  OR: ["Disclose and document any security-deposit changes and separately evaluate local rules.", "Provide a specific written accounting and balance within 31 days after the tenancy and possession end."],
  PA: ["Apply the two-month first-year cap and the one-month later-year limit, including statutory interest/escrow rules after the required period.", "Obtain the tenant's forwarding information and send the itemization and balance within 30 days."],
  RI: ["Apply the one-month cap and do not include prohibited ordinary-wear deductions.", "Return the itemization and balance within 20 days after termination, delivery of possession, and receipt of forwarding information."],
  SC: ["After tenancy termination, possession, demand, and forwarding information, return the itemization and balance within 30 days.", "Disclose differing deposit standards when required for adjoining units."],
  SD: ["Apply the one-month baseline unless special conditions justify and document a larger deposit.", "After tenancy termination and receipt of mailing or delivery instructions, return the deposit or withholding notice within 21 days and provide the detailed itemization within 45 days when requested."],
  TN: ["Hold the deposit in a qualifying account and notify the tenant of its location.", "Follow the statutory inspection, notice, tenant-response, and unclaimed-deposit process.", "Do not represent OpenEscrow's 30-day lifecycle default as a Tennessee statutory return deadline."],
  TX: ["Track surrender of the premises and the tenant's forwarding address.", "Refund the balance within 30 days and provide a written description and itemized list for deductions unless a statutory exception applies.", "Evaluate bad-faith presumptions and the rule governing advance notice of surrender."],
  UT: ["Send the balance and written itemization to the tenant's last known address within 30 days after termination.", "Use the statutory tenant notice and cure process if the landlord misses the deadline."],
  VT: ["Return the itemization and balance within 14 days; use 60 days for qualifying seasonal occupancy that is not a primary residence.", "Check municipal security-deposit ordinances before applying the statewide baseline."],
  VA: ["Apply the two-month cap and disclose authorized deductions.", "Give the tenant the statutory move-out-inspection rights and notices.", "Return the itemization and balance within 45 days and use the contractor-delay procedure only when its conditions are met."],
  WA: ["Complete and sign the move-in condition checklist and provide the required deposit/account disclosures.", "Send a full and specific statement, documentation, and remaining deposit within 30 days.", "Check city and county ordinances, including installment, cap, and move-in-cost rules."],
  WV: ["Return the itemization and balance within 60 days after termination or within 45 days after a later tenant takes possession, whichever is shorter.", "Document any amount due under the rental agreement and exclude ordinary wear."],
  WI: ["Follow ATCP 134 deposit disclosure, check-in, and inspection procedures.", "Return the itemization and balance within 21 days after the applicable surrender or termination trigger.", "Use only deductions authorized by statute and the rental agreement."],
  WY: ["Return the itemization and balance within 30 days after termination and receipt of forwarding information.", "Use the additional 30-day damage period only when damage is verified and the statute permits it."],
});

const SIMPLE_CAP_MONTHS = Object.freeze({
  AL: 1, AK: 2, AZ: 1.5, AR: 2, CA: 1, CT: 2, DE: 1, DC: 1, HI: 1,
  IA: 2, KS: 1, ME: 2, MD: 1, MA: 1, MI: 1.5, MO: 2, NE: 1, NV: 3,
  NJ: 1.5, NY: 1, ND: 1, PA: 2, RI: 1, SD: 1, VA: 2,
});

function deadline(id, label, days, trigger = "possessionReturnedAt", options = {}) {
  return Object.freeze({
    id,
    label,
    days,
    trigger,
    triggerDescription: options.triggerDescription || "actual return of possession",
    dayType: options.dayType || "calendar",
    statutory: options.statutory !== false,
    condition: options.condition || null,
    comparison: options.comparison || null,
  });
}

const DEADLINE_OVERRIDES = Object.freeze({
  AK: [
    deadline("return-compliant-notice", "Return balance and accounting after compliant notice", 14, "possessionReturnedAt", { condition: { fact: "landlordCompliedWithTerminationNotice", equals: true } }),
    deadline("return-other", "Return balance and accounting when the 14-day path does not apply", 30, "possessionReturnedAt", { condition: { fact: "landlordCompliedWithTerminationNotice", equals: false } }),
  ],
  AZ: [deadline("return-accounting", "Return balance and itemized deductions", 14, "statutoryClockStartedAt", { dayType: "business", triggerDescription: "termination, delivery of possession, and tenant demand" })],
  CO: [
    deadline("return-baseline", "Return balance and accounting under the statewide baseline", 30),
    deadline("return-lease-outer-limit", "Absolute outer limit when a lease extends the period", 60, "possessionReturnedAt", { condition: { fact: "leaseExtendsDepositDeadline", equals: true } }),
  ],
  CT: [
    deadline("termination-leg", "First leg of the later-of return calculation", 21, "tenancyTerminatedAt", { comparison: "later-of" }),
    deadline("forwarding-leg", "Second leg of the later-of return calculation", 15, "forwardingAddressReceivedAt", { comparison: "later-of" }),
  ],
  DC: [
    deadline("return-or-notice", "Return deposit or send notice of intent to deduct", 45, "tenancyTerminatedAt"),
    deadline("final-accounting", "Send itemization and remaining balance after deduction notice", 30, "deductionNoticeSentAt"),
  ],
  FL: [
    deadline("no-claim-return", "Return full deposit when no claim is made", 15, "tenancyTerminatedAt", { condition: { fact: "landlordClaimsDeposit", equals: false } }),
    deadline("claim-notice", "Send notice of intent to impose a claim", 30, "tenancyTerminatedAt", { condition: { fact: "landlordClaimsDeposit", equals: true } }),
    deadline("tenant-objection", "Tenant objection period after receiving claim notice", 15, "claimNoticeReceivedAt", { condition: { fact: "landlordClaimsDeposit", equals: true } }),
    deadline("claim-balance", "Send remaining balance after claim notice", 30, "deductionNoticeSentAt", { condition: { fact: "landlordClaimsDeposit", equals: true } }),
  ],
  ID: [
    deadline("return-baseline", "Return balance and accounting", 21),
    deadline("return-lease-outer-limit", "Lease-authorized outer limit", 30, "possessionReturnedAt", { condition: { fact: "leaseExtendsDepositDeadline", equals: true } }),
  ],
  IL: [
    deadline("damage-itemization", "Send damage itemization and supporting records", 30, "statutoryClockStartedAt", { triggerDescription: "the later of vacancy or the end of the tenant's right to possession" }),
    deadline("remaining-balance", "Return the full deposit when required records are not furnished", 45, "statutoryClockStartedAt", { triggerDescription: "the later of vacancy or the end of the tenant's right to possession" }),
  ],
  KY: [
    deadline("accounting", "Send accounting when deductions are made", 30, "tenancyTerminatedAt", { condition: { fact: "landlordClaimsDeposit", equals: true } }),
    deadline("unclaimed-balance", "Complete unclaimed-deposit procedure after tenant notice", 60, "tenantDepositNoticeSentAt"),
  ],
  ME: [
    deadline("at-will-return", "Return for tenancy at will", 21, "possessionReturnedAt", { condition: { fact: "writtenRentalAgreement", equals: false } }),
    deadline("written-lease-return", "Return under a written rental agreement", 30, "possessionReturnedAt", { condition: { fact: "writtenRentalAgreement", equals: true } }),
  ],
  MI: [
    deadline("damage-notice", "Send damage list", 30, "tenancyTerminatedAt"),
    deadline("tenant-response", "Tenant response to damage list", 7, "damageListReceivedAt"),
    deadline("landlord-action", "Landlord action deadline after disputed damages", 45, "tenancyTerminatedAt", { condition: { fact: "tenantDisputesDamageList", equals: true } }),
  ],
  MN: [
    deadline("return-accounting", "Return balance or withholding explanation", 21, "tenancyTerminatedAt", { condition: { fact: "qualifyingCondemnation", equals: false } }),
    deadline("condemnation-return", "Return after qualifying condemnation", 5, "possessionReturnedAt", { condition: { fact: "qualifyingCondemnation", equals: true } }),
  ],
  MT: [
    deadline("full-return", "Return full deposit when there are no deductions", 10, "possessionReturnedAt", { condition: { fact: "landlordClaimsDeposit", equals: false } }),
    deadline("deduction-accounting", "Return balance and accounting when deductions are made", 30, "possessionReturnedAt", { condition: { fact: "landlordClaimsDeposit", equals: true } }),
  ],
  NJ: [
    deadline("standard-return", "Standard return and accounting", 30, "tenancyTerminatedAt", { condition: { fact: "qualifyingDisplacement", equals: false } }),
    deadline("displacement-return", "Accelerated return after qualifying displacement", 5, "displacementOccurredAt", { condition: { fact: "qualifyingDisplacement", equals: true } }),
  ],
  NC: [
    deadline("accounting", "Return balance or provide accounting", 30, "tenancyTerminatedAt"),
    deadline("final-accounting", "Final accounting after timely interim accounting", 60, "tenancyTerminatedAt", { condition: { fact: "finalDamageAmountUnavailableAtDay30", equals: true } }),
  ],
  SD: [
    deadline("return-or-withholding", "Return deposit or provide withholding statement", 21, "statutoryClockStartedAt", { triggerDescription: "tenancy termination and receipt of mailing or delivery instructions" }),
    deadline("detailed-itemization", "Provide detailed itemization when requested", 45, "tenancyTerminatedAt", { condition: { fact: "tenantRequestsDetailedItemization", equals: true } }),
  ],
  TN: [deadline("openescrow-fallback", "OpenEscrow lifecycle safeguard; not a statutory Tennessee return deadline", 30, "possessionReturnedAt", { statutory: false })],
  VT: [
    deadline("standard-return", "Return balance and itemized deductions", 14, "vacancyDiscoveredOrNotifiedAt", { condition: { fact: "seasonalNonPrimaryOccupancy", equals: false }, triggerDescription: "the landlord discovers vacancy or receives notice of the vacancy date" }),
    deadline("seasonal-return", "Return for qualifying seasonal non-primary occupancy", 60, "vacancyDiscoveredOrNotifiedAt", { condition: { fact: "seasonalNonPrimaryOccupancy", equals: true }, triggerDescription: "the landlord discovers vacancy or receives notice of the vacancy date" }),
  ],
  WV: [
    deadline("termination-return", "Return after tenancy termination", 60, "tenancyTerminatedAt", { comparison: "earlier-of" }),
    deadline("replacement-tenant-return", "Return after a later tenant takes possession", 45, "replacementTenantPossessionAt", { comparison: "earlier-of" }),
  ],
  WY: [
    deadline("return-baseline", "Return balance and accounting", 30, "tenancyTerminatedAt"),
    deadline("verified-damage-outer-limit", "Outer limit for verified damage", 60, "tenancyTerminatedAt", { condition: { fact: "verifiedDamageNeedsExtension", equals: true } }),
  ],
});

const GENERIC_EXCEPTIONS = Object.freeze([
  "Coverage can change for subsidized, public, institutional, transient, mobile-home, or other specially regulated housing.",
  "Local ordinances can add caps, interest, notice, installment, inspection, translation, or return requirements.",
  "Displacement, abandonment, domestic violence, military status, condemnation, sale, and landlord-size rules can change the result.",
]);

function depositCapFor(postalCode, summary) {
  const months = SIMPLE_CAP_MONTHS[postalCode];
  const resolvedSummary =
    postalCode === "MN"
      ? "No general statewide monetary cap identified in the reviewed statute; the deposit earns statutory interest."
      : summary;
  return Object.freeze(
    Number.isFinite(months)
      ? { kind: "months-rent", months, summary: resolvedSummary }
      : { kind: "manual", months: null, summary: resolvedSummary },
  );
}

function deadlinesFor(postalCode, days) {
  return Object.freeze(
    DEADLINE_OVERRIDES[postalCode] || [
      deadline(
        "return-accounting",
        "Return remaining deposit and itemized deductions",
        days,
      ),
    ],
  );
}

const PROFILE_METADATA_OVERRIDES = Object.freeze({
  CO: Object.freeze({
    statuteCitation: "Colo. Rev. Stat. §§ 38-12-102.5, 38-12-103",
    statuteUrl: "https://olls.info/crs/crs2025-title-38.pdf",
    depositCapSummary:
      "Two months' rent; a separate refundable pet-deposit limit and narrow exceptions apply.",
    depositCap: Object.freeze({
      kind: "months-rent",
      months: 2,
      summary:
        "Two months' rent; a separate refundable pet-deposit limit and narrow exceptions apply.",
    }),
  }),
  HI: Object.freeze({
    version: "hi-rules-2026-08-08.v5",
    statuteUrl: "https://cca.hawaii.gov/ocp/landlord-tenant-residential-code/",
    researchedOn: "2026-08-08",
  }),
  IL: Object.freeze({
    statuteUrl:
      "https://ilga.gov/Legislation/ILCS/Articles?ActID=2202&Chapter=PROPERTY&ChapterID=62&MajorTopic=RIGHTS+AND+REMEDIES",
    deadlineSummary:
      "Damage itemization and records are due within 30 days after the later of vacancy or possession ending; full return is due within 45 days when those records are not furnished.",
  }),
  MN: Object.freeze({
    statuteCitation: "Minn. Stat. §§ 504B.178, 504B.182",
  }),
  MS: Object.freeze({
    version: "ms-rules-2026-08-08.v5",
    statuteUrl:
      "https://www.mid.ms.gov/mississippi-insurance-department/legal/mississippi-code/",
    researchedOn: "2026-08-08",
  }),
  NC: Object.freeze({
    version: "nc-rules-2026-08-08.v5",
    statuteUrl:
      "https://bulletins.ncrec.gov/north-carolina-tenant-security-deposit-act-a-simple-guide-for-nc-landlords-and-property-managers/",
    researchedOn: "2026-08-08",
  }),
  NH: Object.freeze({
    version: "nh-rules-2026-08-08.v6",
    statuteUrl:
      "https://www.courts.nh.gov/sites/g/files/ehbemt471/files/documents/2021-04/540-a-checklist.pdf",
    researchedOn: "2026-08-08",
  }),
  NJ: Object.freeze({
    statuteUrl: "https://www.nj.gov/dca/codes/publications/pdf_lti/sdepsit_law.pdf",
  }),
  NV: Object.freeze({
    version: "nv-rules-2026-08-08.v5",
    statuteUrl:
      "https://www.dcfs.nv.gov/siteassets/dcfs.nv.gov/content/programs/cws/il/SurvivalGuide-Final.pdf",
    researchedOn: "2026-08-08",
  }),
  NY: Object.freeze({
    version: "ny-rules-2026-08-08.v5",
    statuteUrl:
      "https://ag.ny.gov/press-release/2026/attorney-general-james-releases-top-10-consumer-complaints-2025",
    researchedOn: "2026-08-08",
  }),
  OH: Object.freeze({
    version: "oh-rules-2026-08-08.v5",
    statuteUrl:
      "https://www.supremecourt.ohio.gov/rod/docs/pdf/10/2025/2025-Ohio-2840.pdf",
    researchedOn: "2026-08-08",
  }),
  PA: Object.freeze({
    statuteUrl:
      "https://www.palegis.us/statutes/unconsolidated/law-information/view-statute%26txtType%3DPDF%26SessYr%3D1951%26SessInd%3D0%26ActNum%3D0020.%26chpt%3D005.%26subchpt%3D000.%26sctn%3D012.%26subsctn%3D000.",
  }),
  SD: Object.freeze({
    statuteCitation: "S.D. Codified Laws §§ 43-32-6.1, 43-32-24",
    defaultClaimDays: "21",
    statutoryDeadlineDays: 21,
    deadlineSummary:
      "Twenty-one-day return or withholding-notice period; detailed itemization is due within 45 days when requested.",
  }),
  VT: Object.freeze({
    deadlineSummary:
      "Fourteen-day return and itemization period; qualifying seasonal non-primary occupancy uses 60 days.",
  }),
});

export const US_JURISDICTION_PROFILES = Object.freeze(
  STATE_SPECS.map(
    ([
      postalCode,
      name,
      defaultClaimDays,
      statutoryDeadlineDays,
      statuteCitation,
      statuteUrl,
      depositCapSummary,
      deadlineSummary,
    ]) => {
      const metadataOverride = PROFILE_METADATA_OVERRIDES[postalCode] || {};
      const requirements = Object.freeze([
        ...COMMON_REQUIREMENTS,
        ...(STATE_REQUIREMENTS[postalCode] || []),
      ]);
      const resolvedCitation =
        metadataOverride.statuteCitation || statuteCitation;
      const resolvedUrl = metadataOverride.statuteUrl || statuteUrl;
      return Object.freeze({
        code: `us-${postalCode.toLowerCase()}`,
        postalCode,
        name,
        label: `${name} residential tenancy`,
        version: `${postalCode.toLowerCase()}-${PROFILE_VERSION}`,
        defaultClaimDays: String(defaultClaimDays),
        statutoryDeadlineDays,
        statuteCitation,
        statuteUrl,
        depositCapSummary:
          postalCode === "MN"
            ? "No general statewide monetary cap identified in the reviewed statute; the deposit earns statutory interest."
            : depositCapSummary,
        deadlineSummary,
        depositCap: depositCapFor(postalCode, depositCapSummary),
        deadlines: deadlinesFor(postalCode, statutoryDeadlineDays ?? defaultClaimDays),
        requirements,
        exceptions: GENERIC_EXCEPTIONS,
        researchStatus: "implemented-research",
        reviewMethod: "OpenAI review of cited official source; not attorney-reviewed",
        researchedOn: RESEARCH_DATE,
        localOverlayRequired: true,
        legalReviewRequired: true,
        ...metadataOverride,
        claimPolicy: buildClaimPolicy(postalCode, requirements, {
          citation: resolvedCitation,
          url: resolvedUrl,
        }),
      });
    },
  ),
);

export const US_JURISDICTION_PROFILE_BY_CODE = Object.freeze(
  Object.fromEntries(US_JURISDICTION_PROFILES.map((profile) => [profile.code, profile])),
);

export const US_JURISDICTION_PROFILE_BY_POSTAL_CODE = Object.freeze(
  Object.fromEntries(
    US_JURISDICTION_PROFILES.map((profile) => [profile.postalCode, profile]),
  ),
);

export const US_STATE_POSTAL_CODE_BY_NAME = Object.freeze(
  Object.fromEntries(
    US_JURISDICTION_PROFILES.map((profile) => [profile.name.toLowerCase(), profile.postalCode]),
  ),
);
