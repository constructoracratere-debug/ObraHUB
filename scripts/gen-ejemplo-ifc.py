# Genera un IFC4 válido: 4 muros + losa + 4 columnas + viga
lines = []
A = lines.append
A("ISO-10303-21;")
A("HEADER; FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');")
A("FILE_NAME('ObraHub-Ejemplo-Estructural.ifc','2026-08-26',('ObraHub'),('Cratere SAS'),'ObraHub Gen 1.0','ObraHub','');")
A("FILE_SCHEMA(('IFC4')); ENDSEC; DATA;")
A("#1= IFCPROJECT('2O$eHI.$fgrfmXibZOsk0O',#2,'Proyecto Ejemplo Estructural',$,$,$,$,(#11),#5);")
A("#2= IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,1770000000);")
A("#3= IFCPERSONANDORGANIZATION(#7,#8,$);")
A("#4= IFCAPPLICATION(#9,'1.0','ObraHub Gen','OH');")
A("#5= IFCUNITASSIGNMENT((#6));")
A("#6= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);")
A("#7= IFCPERSON($,'Pineda','Diego',$,$,$,$,$);")
A("#8= IFCORGANIZATION($,'Cratere SAS',$,$,$);")
A("#9= IFCORGANIZATION($,'ObraHub',$,$,$);")
A("#11= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#12,#13);")
A("#12= IFCAXIS2PLACEMENT3D(#14,$,$);")
A("#13= IFCDIRECTION((0.,1.));")
A("#14= IFCCARTESIANPOINT((0.,0.,0.));")
A("#50= IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#11,$,.MODEL_VIEW.,$);")
A("#20= IFCSITE('3lOsk0O$fgrfmXibZOsk0O1',#2,'Terreno',$,$,#21,$,$,.ELEMENT.,$,$,$,$,$);")
A("#21= IFCLOCALPLACEMENT($,#22);")
A("#22= IFCAXIS2PLACEMENT3D(#14,$,$);")
A("#30= IFCBUILDING('4lOsk0O$fgrfmXibZOsk0O2',#2,'Edificio Ejemplo',$,$,#31,$,$,.ELEMENT.,$,$,$);")
A("#31= IFCLOCALPLACEMENT(#21,#22);")
A("#40= IFCBUILDINGSTOREY('5lOsk0O$fgrfmXibZOsk0O3',#2,'Piso 1 - NPT 0.00',$,$,#41,$,$,.ELEMENT.,0.);")
A("#41= IFCLOCALPLACEMENT(#31,#22);")

def rprof(idx, w, h, px, py):
    A(f"#{idx}= IFCRECTANGLEPROFILEDEF(.AREA.,$,#1000{idx},{w},{h});")
    A(f"#1000{idx}= IFCAXIS2PLACEMENT2D(IFCCARTESIANPOINT(({px},{py})),#13);")

def solid(idx, prof, dx, dy, dz, depth):
    A(f"#{idx}= IFCEXTRUDEDAREASOLID(#{prof},#2000{idx},#13,{depth});")
    A(f"#2000{idx}= IFCAXIS2PLACEMENT3D(IFCCARTESIANPOINT(({dx},{dy},{dz})),IFCDIRECTION((0.,0.,1.)),IFCDIRECTION((1.,0.,0.)));")

def shape(idx, solidid):
    A(f"#{idx}= IFCSHAPEREPRESENTATION(#50,'Body','SweptSolid',(#{solidid}));")

# Muros (norte/sur 6m, este/oeste 4m), espesor 0.15, alto 2.5
rprof(60, 6.15, 0.15, 3.075, 0.075); solid(61, 60, 0, 3.925, 0, 2.5); shape(62, 61)
rprof(64, 6.15, 0.15, 3.075, 0.075); solid(65, 64, 0, -0.075, 0, 2.5); shape(66, 65)
rprof(68, 0.15, 4.15, 0.075, 2.075); solid(69, 68, 5.925, 0, 0, 2.5); shape(70, 69)
rprof(72, 0.15, 4.15, 0.075, 2.075); solid(73, 72, -0.075, 0, 0, 2.5); shape(74, 73)
# Losa fondo
rprof(80, 6.3, 4.3, 3.15, 2.15); solid(81, 80, -0.15, -0.15, -0.12, 0.12); shape(82, 81)
# 4 columnas 0.3x0.3
for k, (cx, cy) in enumerate([(0.15, 0.15), (5.85, 0.15), (0.15, 3.85), (5.85, 3.85)]):
    rprof(90 + k * 3, 0.3, 0.3, 0.15, 0.15)
    solid(91 + k * 3, 90 + k * 3, cx - 0.15, cy - 0.15, 0, 2.5)
    shape(92 + k * 3, 91 + k * 3)
# Viga fachada norte en Z=2.5
rprof(105, 6.3, 0.3, 3.15, 0.15); solid(106, 105, -0.15, 3.7, 2.5, 0.3); shape(107, 106)

walls = ["Muro-Norte-Mamposteria-Confinada", "Muro-Sur-Mamposteria-Confinada",
         "Muro-Este-Mamposteria-Confinada", "Muro-Oeste-Mamposteria-Confinada"]
for i, name in enumerate(walls):
    A(f"#{110+i}= IFCWALLSTANDARDCASE('1hXG${100+i}GyWQRrbBWI2X',#2,'{name}',$,$,#120+i,(#{62+i*4}),$);")
    A(f"#{120+i}= IFCLOCALPLACEMENT(#41,#22);")
A("#114= IFCSLAB('6lOsk0O$fgrfmXibZOsk0O4',#2,'Losa-Fondo-Concreto-3000psi',$,$,#124,(#82),$,.FLOOR.);")
A("#124= IFCLOCALPLACEMENT(#41,#22);")
for k in range(4):
    A(f"#{130+k}= IFCCOLUMN('7lOsk0O$fgrfmXibZOsk0O{5+k}',#2,'Columna-C{k+1}-Concreto-4000psi',$,$,#140+k,(#{92+k*3}),$);")
    A(f"#{140+k}= IFCLOCALPLACEMENT(#41,#22);")
A("#150= IFCBEAM('8lOsk0O$fgrfmXibZOsk0O9',#2,'Viga-Fachada-C1-Concreto',$,$,#151,(#107),$);")
A("#151= IFCLOCALPLACEMENT(#41,#22);")
A("#160= IFCRELAGGREGATES('9$grfmXibZOsk0O1',#2,$,$,#1,(#20));")
A("#161= IFCRELAGGREGATES('9$grfmXibZOsk0O2',#2,$,$,#20,(#30));")
A("#162= IFCRELAGGREGATES('9$grfmXibZOsk0O3',#2,$,$,#30,(#40));")
A("#170= IFCRELCONTAINEDINSPATIALSTRUCTURE('A$grfmXibZOsk0O1',#2,$,$,(#110,#111,#112,#113,#114,#130,#131,#132,#133,#150),#40);")
A("ENDSEC; END-ISO-10303-21;")
open("ejemplo-estructural.ifc", "w").write("\n".join(lines))
print("IFC generado:", len(lines), "lineas")
