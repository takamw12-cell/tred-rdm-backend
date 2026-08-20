import { solveRdm } from "./rdm-solver";

let failures = 0;
function check(label: string, got: number, want: number, tol = 1e-3) {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) failures++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${label.padEnd(46)} got=${got.toFixed(3).padStart(12)}  want=${want.toFixed(3)}`);
}
function must(r: any, label: string) {
  if (!r.ok) { failures++; console.log(`FAIL  ${label}: ${r.error}`); return null; }
  return r;
}

// 1. Einfeldträger, Einzellast in Feldmitte : A=B=F/2, Mmax=FL/4
{
  const r = must(solveRdm({ length: 4, supports:[{x:0,kind:"festlager",name:"A"},{x:4,kind:"loslager",name:"B"}], pointLoads:[{x:2,F:1000}] }), "1");
  if (r) { check("1 Einfeldträger F mittig: A", r.reactions[0].force, 500);
           check("1 Einfeldträger F mittig: B", r.reactions[1].force, 500);
           check("1 Einfeldträger F mittig: Mmax", r.extremes.momentMax.y, 1000); }
}
// 2. Einfeldträger, Gleichlast : A=B=qL/2, Mmax=qL^2/8
{
  const r = must(solveRdm({ length: 6, supports:[{x:0,kind:"festlager"},{x:6,kind:"loslager"}], distributedLoads:[{from:0,to:6,q:2000}] }), "2");
  if (r) { check("2 Gleichlast: A", r.reactions[0].force, 6000);
           check("2 Gleichlast: Mmax", r.extremes.momentMax.y, 9000); }
}
// 3. Kragarm, Last am freien Ende : V=F, M_Einspannung = -F*L
{
  const r = must(solveRdm({ length: 3, supports:[{x:0,kind:"einspannung",name:"E"}], pointLoads:[{x:3,F:500}] }), "3");
  if (r) { check("3 Kragarm: Auflagerkraft", r.reactions[0].force, 500);
           check("3 Kragarm: Einspannmoment", r.reactions[0].moment, -1500);
           check("3 Kragarm: M(0)", r.moment[0].y, -1500); }
}
// 4. Beidseitig eingespannt, F mittig : R=F/2, M_Rand=-FL/8, M_Feld=+FL/8
{
  const r = must(solveRdm({ length: 4, supports:[{x:0,kind:"einspannung",name:"A"},{x:4,kind:"einspannung",name:"B"}], pointLoads:[{x:2,F:1000}] }), "4");
  if (r) { check("4 bds. eingespannt: R", r.reactions[0].force, 500);
           check("4 bds. eingespannt: M_Rand", r.reactions[0].moment, -500);
           check("4 bds. eingespannt: M_Feld", r.extremes.momentMax.y, 500);
           check("4 Unbestimmtheitsgrad", r.degreeOfIndeterminacy, 2); }
}
// 5. Eingespannt + Stütze (Kragträger mit Stütze), Gleichlast : R_Stütze=3qL/8, M_Einsp=-qL^2/8
{
  const r = must(solveRdm({ length: 4, supports:[{x:0,kind:"einspannung",name:"A"},{x:4,kind:"loslager",name:"B"}], distributedLoads:[{from:0,to:4,q:1000}] }), "5");
  if (r) { check("5 Stützträger: R_B = 3qL/8", r.reactions[1].force, 1500);
           check("5 Stützträger: R_A = 5qL/8", r.reactions[0].force, 2500);
           check("5 Stützträger: M_A = -qL^2/8", r.reactions[0].moment, -2000); }
}
// 6. Zweifeldträger, Gleichlast : R_Rand=0,375qL, R_Mitte=1,25qL
{
  const r = must(solveRdm({ length: 10, supports:[{x:0,kind:"festlager",name:"A"},{x:5,kind:"loslager",name:"B"},{x:10,kind:"loslager",name:"C"}], distributedLoads:[{from:0,to:10,q:1000}] }), "6");
  if (r) { check("6 Zweifeldträger: R_A", r.reactions[0].force, 1875);
           check("6 Zweifeldträger: R_B", r.reactions[1].force, 6250);
           check("6 Zweifeldträger: M_Stütze", r.extremes.momentMin.y, -3125); }
}
// 7. Einheiten: 1500 mm / 1,2 kN  ==  1,5 m / 1200 N
{
  const a = must(solveRdm({ length: "1,5 m", supports:[{x:"0 m",kind:"festlager"},{x:"1500 mm",kind:"loslager"}], pointLoads:[{x:"750 mm",F:"1,2 kN"}] }), "7");
  if (a) { check("7 Einheiten mm/kN: A", a.reactions[0].force, 600);
           check("7 Einheiten mm/kN: Mmax", a.extremes.momentMax.y, 450); }
}
// 8. Instabil : ein einzelnes Loslager
{
  const r: any = solveRdm({ length: 3, supports:[{x:0,kind:"loslager"}], pointLoads:[{x:3,F:100}] });
  console.log(`${r.ok===false && r.code==="UNSTABLE" ? "OK  " : "FAIL"}  8 einzelnes Loslager -> UNSTABLE (${r.ok?"ok:true":r.code})`);
  if (r.ok) failures++;
}
// 9. Unbekannte Einheit
{
  const r: any = solveRdm({ length: "4 furlong", supports:[{x:0,kind:"festlager"},{x:1,kind:"loslager"}] });
  console.log(`${r.ok===false && r.code==="INVALID_UNIT" ? "OK  " : "FAIL"}  9 unbekannte Einheit -> INVALID_UNIT`);
  if (r.ok) failures++;
}
// 10. Gleichgewichtsresiduum muss ~0 sein
{
  const r = must(solveRdm({ length: 8, supports:[{x:1,kind:"festlager"},{x:7,kind:"loslager"}], pointLoads:[{x:0,F:300},{x:8,F:700}], distributedLoads:[{from:2,to:5,q:400}], pointMoments:[{x:4,M:250}] }), "10");
  if (r) { check("10 Residuum ΣV", r.equilibrium.sumForces, 0, 1e-6);
           check("10 Residuum ΣM", r.equilibrium.sumMoments, 0, 1e-6); }
}
console.log(failures === 0 ? "\n✅ TOUS LES CAS PASSENT" : `\n❌ ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
