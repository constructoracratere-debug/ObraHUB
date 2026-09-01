# Genera IFC4 VALIDO: 4 muros + losa + 4 columnas + viga (esquema correcto:
# IFCPRODUCTDEFINITIONSHAPE envuelve a IFCSHAPEREPRESENTATION en cada producto)
L = []
A = L.append
g = lambda i: f"{i:013d}GyWQRrbBWI2X"  # GlobalId único de 22 chars

A("ISO-10303-21;")
A("HEADER;")
A("FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');")
A("FILE_NAME('ObraHub-Ejemplo-Estructural.ifc','2026-08-26',('ObraHub'),('Cratere SAS'),'ObraHubGen 2.0','ObraHub','');")
A("FILE_SCHEMA(('IFC4'));")
A("ENDSEC;")
A("DATA;")
A("#1= IFCPROJECT('0x2vPGyWQRrbBWI2X0001',#2,'Proyecto Ejemplo Estructural',$,$,$,$,(#11),#5);")
A("#2= IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,1770000000);")
A("#3= IFCPERSONANDORGANIZATION(#7,#8,$);")
A("#4= IFCAPPLICATION(#9,'2.0','ObraHub Gen','OH');")
A("#5= IFCUNITASSIGNMENT((#6,#10));")
A("#6= IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);")
A("#10= IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);")
A("#7= IFCPERSON($,'Pineda','Diego',$,$,$,$,$);")
A("#8= IFCORGANIZATION($,'Cratere SAS',$,$,$);")
A("#9= IFCORGANIZATION($,'ObraHub',$,$,$);")
A("#11= IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#12,#13);")
A("#12= IFCAXIS2PLACEMENT3D(#14,$,$);")
A("#13= IFCDIRECTION((0.,1.));")
A("#14= IFCCARTESIANPOINT((0.,0.,0.));")
A("#15= IFCDIRECTION((1.,0.));")   # dir 2D para perfiles
A("#16= IFCDIRECTION((0.,0.,1.));") # extrusión
A("#17= IFCDIRECTION((1.,0.,0.));") # ref direction
A("#50= IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#11,$,.MODEL_VIEW.,$);")

def rprof(i, w, h, px, py):
    A(f"#{i}= IFCRECTANGLEPROFILEDEF(.AREA.,$,#100{i},{w},{h});")
    A(f"#300{i}= IFCCARTESIANPOINT(({px},{py}));")
    A(f"#100{i}= IFCAXIS2PLACEMENT2D(#300{i},#15);")

def solid(i, prof, dx, dy, dz, depth):
    A(f"#{i}= IFCEXTRUDEDAREASOLID(#{prof},#200{i},#16,{depth});")
    A(f"#400{i}= IFCCARTESIANPOINT(({dx},{dy},{dz}));")
    A(f"#200{i}= IFCAXIS2PLACEMENT3D(#400{i},#16,#17);")

def product(i, guid_n, etype, name, prof, dx, dy, dz, depth, tail=""):
    solid(9000 + i, prof, dx, dy, dz, depth)
    A(f"#{9100+i}= IFCSHAPEREPRESENTATION(#50,'Body','SweptSolid',(#{9000+i}));")
    A(f"#{9200+i}= IFCPRODUCTDEFINITIONSHAPE($,$,(#{9100+i}));")
    A(f"#{9300+i}= IFCLOCALPLACEMENT(#41,#22);")
    A(f"#{i}= {etype}('{g(guid_n)}',#2,'{name}',$,$,#{9300+i},#{9200+i},${tail});")

# Estructura espacial
A("#20= IFCSITE('1x2vPGyWQRrbBWI2X0002',#2,'Terreno',$,$,#21,$,$,.ELEMENT.,$,$,$,$,$);")
A("#21= IFCLOCALPLACEMENT($,#22);")
A("#22= IFCAXIS2PLACEMENT3D(#14,#16,#17);")
A("#30= IFCBUILDING('2x2vPGyWQRrbBWI2X0003',#2,'Edificio Ejemplo',$,$,#31,$,$,.ELEMENT.,$,$,$);")
A("#31= IFCLOCALPLACEMENT(#21,#22);")
A("#40= IFCBUILDINGSTOREY('3x2vPGyWQRrbBWI2X0004',#2,'Piso 1 - NPT 0.00',$,$,#41,$,$,.ELEMENT.,0.);")
A("#41= IFCLOCALPLACEMENT(#31,#22);")

# Perfiles: N/S 6.15x0.15 | E/O 0.15x4.15 | losa 6.3x4.3 | col 0.3x0.3 | viga 6.3x0.3
rprof(60, 6.15, 0.15, 3.075, 0.075)   # 60
rprof(64, 6.15, 0.15, 3.075, 0.075)   # 64
rprof(68, 0.15, 4.15, 0.075, 2.075)   # 68
rprof(72, 0.15, 4.15, 0.075, 2.075)   # 72
rprof(80, 6.3, 4.3, 3.15, 2.15)       # 80 losa
rprof(105, 6.3, 0.3, 3.15, 0.15)      # 105 viga

product(110, 110, "IFCWALLSTANDARDCASE", "Muro-Norte-Mamposteria-Confinada", 60, 0, 3.925, 0, 2.5)
product(111, 111, "IFCWALLSTANDARDCASE", "Muro-Sur-Mamposteria-Confinada", 64, 0, -0.075, 0, 2.5)
product(112, 112, "IFCWALLSTANDARDCASE", "Muro-Este-Mamposteria-Confinada", 68, 5.925, 0, 0, 2.5)
product(113, 113, "IFCWALLSTANDARDCASE", "Muro-Oeste-Mamposteria-Confinada", 72, -0.075, 0, 0, 2.5)
product(114, 114, "IFCSLAB", "Losa-Fondo-Concreto-3000psi", 80, -0.15, -0.15, -0.12, 0.12, tail=",.FLOOR.")
product(130, 130, "IFCCOLUMN", "Columna-C1-Concreto-4000psi", 90, 0.0, 0.0, 0, 2.5)
A("#90= IFCRECTANGLEPROFILEDEF(.AREA.,$,#10090,0.3,0.3); #30090= IFCCARTESIANPOINT((0.15,0.15)); #10090= IFCAXIS2PLACEMENT2D(#30090,#15);")
product(131, 131, "IFCCOLUMN", "Columna-C2-Concreto-4000psi", 91, 5.7, 0.0, 0, 2.5)
A("#91= IFCRECTANGLEPROFILEDEF(.AREA.,$,#10091,0.3,0.3); #30091= IFCCARTESIANPOINT((0.15,0.15)); #10091= IFCAXIS2PLACEMENT2D(#30091,#15);")
product(132, 132, "IFCCOLUMN", "Columna-C3-Concreto-4000psi", 92, 0.0, 3.7, 0, 2.5)
A("#92= IFCRECTANGLEPROFILEDEF(.AREA.,$,#10092,0.3,0.3); #30092= IFCCARTESIANPOINT((0.15,0.15)); #10092= IFCAXIS2PLACEMENT2D(#30092,#15);")
product(133, 133, "IFCCOLUMN", "Columna-C4-Concreto-4000psi", 93, 5.7, 3.7, 0, 2.5)
A("#93= IFCRECTANGLEPROFILEDEF(.AREA.,$,#10093,0.3,0.3); #30093= IFCCARTESIANPOINT((0.15,0.15)); #10093= IFCAXIS2PLACEMENT2D(#30093,#15);")
product(150, 150, "IFCBEAM", "Viga-Fachada-C1-Concreto", 105, -0.15, 3.7, 2.5, 0.3)

A("#160= IFCRELAGGREGATES('4x2vPGyWQRrbBWI2X0010',#2,$,$,#1,(#20));")
A("#161= IFCRELAGGREGATES('4x2vPGyWQRrbBWI2X0011',#2,$,$,#20,(#30));")
A("#162= IFCRELAGGREGATES('4x2vPGyWQRrbBWI2X0012',#2,$,$,#30,(#40));")
A("#170= IFCRELCONTAINEDINSPATIALSTRUCTURE('5x2vPGyWQRrbBWI2X0013',#2,$,$,(#110,#111,#112,#113,#114,#130,#131,#132,#133,#150),#40);")
A("ENDSEC;")
A("END-ISO-10303-21;")
open("ejemplo-estructural.ifc", "w").write("\n".join(L))
print("OK:", len(L), "lineas |", sum(1 for l in L if "IFCWALLSTANDARDCASE" in l), "muros |", sum(1 for l in L if "IFCCOLUMN(" in l), "columnas |", sum(1 for l in L if "IFCSLAB(" in l), "losa |", sum(1 for l in L if "IFCBEAM(" in l), "viga")
