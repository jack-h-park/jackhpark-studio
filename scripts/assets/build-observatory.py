"""Author the original, deterministic Signal Observatory environment.

Run: blender --background --python scripts/assets/build-observatory.py
Coordinates in helpers are (east, south, elevation); glTF exports Y-up.
Static geometry is joined by material to avoid a draw call per prop.
"""
import bpy
import gzip
import math
import random
from pathlib import Path
from mathutils import Vector

random.seed(73)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/experiences/pm-intelligence/observatory/campus.glb'
OUT.parent.mkdir(parents=True, exist_ok=True)


def material(name, rgb, metal=0, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*rgb, 1)
    p.inputs['Roughness'].default_value = .78 if not metal else .38
    p.inputs['Metallic'].default_value = metal
    if emission:
        p.inputs['Emission Color'].default_value = (*rgb, 1)
        p.inputs['Emission Strength'].default_value = emission
    return m

stone = material('Moonwashed limestone', (.48, .50, .66))
trim = material('Pale stone trim', (.70, .68, .75))
rock = [material('Basalt %d' % i, c) for i, c in enumerate([
    (.16,.18,.31), (.21,.22,.38), (.27,.27,.44), (.32,.31,.47), (.25,.29,.42)])]
pathmat = material('Slate paving', (.40,.42,.53))
wood = material('Cedar timber', (.26,.16,.16))
gold = material('Aged brass', (.62,.40,.17), .65)
roof = material('Indigo enamel', (.20,.25,.47), .32)
leaves = [material('Pine %d' % i,c) for i,c in enumerate([(.055,.16,.17),(.075,.22,.22),(.12,.27,.29)])]
window = material('Amber light', (1,.29,.055), emission=1.3)
cyan = material('Source light', (.12,.75,.89), emission=2)
paper = material('Archive paper', (.80,.73,.54))
glass = material('Greenhouse blue glass', (.13,.30,.39), .45)
petal = material('Wildflowers', (.62,.54,.77))
soil = material('Garden soil', (.12,.13,.16))
flower_gold = material('Golden alpine flowers', (.78,.58,.24))
# A small authored material swatch supplies detail; scene lighting supplies the night palette.
image=bpy.data.images.load(str(ROOT / 'scripts/assets/observatory/limestone-albedo.jpg'))
image.colorspace_settings.name='sRGB'
texture=pathmat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image;texture.extension='REPEAT'
pathmat.node_tree.links.new(texture.outputs['Color'],pathmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])



def coord(x,d,h):
    return (x,-d,h)


def finish(o, name, mat):
    o.name = name
    o.data.materials.append(mat)
    return o


def box(name,x,d,h,sx,sd,sh,mat, bevel=0,angle=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=coord(x,d,h))
    o=bpy.context.object
    o.scale=(sx,sd,sh)
    o.rotation_euler[2]=angle
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft worked edges','BEVEL'); mod.width=bevel; mod.segments=1
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,mat)


def cyl(name,x,d,h,r,depth,mat,vertices=32,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=coord(x,d,h))
    return finish(bpy.context.object,name,mat)


def sphere(name,x,d,h,r,mat,scale=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=r,location=coord(x,d,h))
    o=finish(bpy.context.object,name,mat)
    if scale: o.scale=scale
    return o


def beam(name,a,b,r,mat):
    av=Vector(coord(*a)); bv=Vector(coord(*b)); diff=bv-av
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=diff.length,location=(av+bv)/2)
    o=bpy.context.object; o.rotation_euler=diff.to_track_quat('Z','Y').to_euler()
    return finish(o,name,mat)


def torus(name,x,d,h,r,minor,mat,rot=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=6,location=coord(x,d,h),major_radius=r,minor_radius=minor)
    o=finish(bpy.context.object,name,mat)
    if rot: o.rotation_euler=rot
    return o


def cliff(x,d,top,r):
    cyl('Cliff crown',x,d,top-.20,r,.45,rock[3],vertices=11,r2=r*.96)
    for j in range(9):
        a=j*math.tau/9
        rx=x+math.cos(a)*r*.60; rd=d+math.sin(a)*r*.60
        ht=random.uniform(3,5)
        o=cyl('Fractured basalt',rx,rd,top-ht/2-.28,r*.47,ht,random.choice(rock),vertices=random.choice([5,6,7]),r2=r*.39)
        o.rotation_euler[2]=random.random()
    cyl('Terrace surface',x,d,top+.04,r*.89,.14,pathmat,vertices=24)
    for k in range(15):
        a=k*math.tau/15+random.uniform(-.12,.12)
        rr=r*random.uniform(.78,.96)
        sphere('Cliff ledge boulder',x+math.cos(a)*rr,d+math.sin(a)*rr,top-random.uniform(.25,1.4),random.uniform(.48,1.0),random.choice(rock),(1,1,random.uniform(1,2.3)))
    for k in range(12):
        a=random.uniform(0,math.tau); rr=r*random.uniform(.55,.84)
        box('Irregular paving',x+math.cos(a)*rr,d+math.sin(a)*rr,top+.12,random.uniform(.24,.6),random.uniform(.25,.65),.05,stone,angle=random.uniform(-.3,.3))



def pine(x,d,h,size=1):
    cyl('Pine trunk',x,d,h+size*.65,.075*size,1.3*size,wood,vertices=6)
    for i in range(4):
        cyl('Pine tier',x,d,h+size*(.65+i*.38),size*(.65-i*.12),size*.8,leaves[i%3],vertices=7,r2=0)


def lamp(x,d,h):
    cyl('Lantern plinth',x,d,h+.12,.19,.24,trim,vertices=8)
    cyl('Lantern stem',x,d,h+.48,.055,.72,gold,vertices=8)
    box('Lantern glow',x,d,h+.95,.24,.24,.40,window)
    cyl('Lantern roof',x,d,h+1.2,.25,.18,gold,vertices=4,r2=0)
    for sx,sz in [(-1,-1),(-1,1),(1,-1),(1,1)]:
        beam('Lantern frame',(x+sx*.13,d+sz*.13,h+.73),(x+sx*.13,d+sz*.13,h+1.15),.018,gold)


def walkway(a,b,width=1.35,stairs=False):
    x,d,h=a; xx,dd,hh=b; length=math.hypot(xx-x,dd-d)
    count=max(3,int(length/.36))
    for i in range(count+1):
        t=i/count; px=x+(xx-x)*t; pd=d+(dd-d)*t; ph=h+(hh-h)*t
        box('Stepping stone',px,pd,ph-.13,width,.44,.24,trim if i%3==0 else pathmat,bevel=.025,angle=-math.atan2(xx-x,dd-d))
        if i%4==0:
            dx=(dd-d)/length*width*.58; dz=-(xx-x)/length*width*.58
            for sign in [-1,1]:
                cyl('Path bollard',px+sign*dx,pd+sign*dz,ph+.25,.055,.5,wood,vertices=6)
                if i<count:
                    t2=min(1,(i+4)/count)
                    beam('Path handrail',(px+sign*dx,pd+sign*dz,ph+.48),(x+(xx-x)*t2+sign*dx,d+(dd-d)*t2+sign*dz,h+(hh-h)*t2+.48),.035,wood)
    if length>4:
        for t in [.2,.8]:
            lamp(x+(xx-x)*t+width*.75,d+(dd-d)*t,h+(hh-h)*t)


def pavilion(x,d,h,label):
    cliff(x,d,h,2.45)
    box(label+' floor',x,d,h+.15,3.3,2.5,.3,trim,bevel=.06)
    box(label+' body',x,d,h+1.2,2.8,2.2,2.0,stone,bevel=.08)
    box(label+' warm doorway',x,d+1.12,h+1.13,.65,.06,1.6,window)
    for sx in [-.87,.87]:
        box(label+' window',x+sx,d+1.13,h+1.35,.40,.05,.85,window)
        box('Window sill',x+sx,d+1.2,h+.89,.55,.18,.1,trim)
    box('Cornice',x,d,h+2.23,3.15,2.5,.20,trim,bevel=.03)
    cyl('Pavilion hip roof',x,d,h+2.65,2.2,.8,roof,vertices=4,r2=0).rotation_euler[2]=math.pi/4
    for side in [-1,1]: pine(x+side*2,d-.4,h,.85)
    lamp(x+1.3,d+1.7,h)


# The terrain is a connected campus with distinct elevations, not floating UI platforms.
cliff(0,-3.5,3.8,4.9)
cliff(-2,7.8,.5,4.3)
cliff(-8,3.5,1.6,3.1)
cliff(6.7,6.5,.8,3.25)
pavilion(-9,-6.5,5.0,'Writing pavilion')
pavilion(7,-7,5.0,'Question library')
cyl('Question library cupola',7,-7,8.2,.72,.5,stone,vertices=20)
sphere('Question library copper dome',7,-7,8.45,.8,gold,(1,1,.65))
cliff(11,4.0,1.65,2.45)
box('Lookout floor',11,4,1.85,3.6,2.7,.2,trim,bevel=.05)
for xx in [9.5,12.5]:
    for dd in [2.9,5.1]:
        beam('Lookout column',(xx,dd,1.9),(xx,dd,4),.09,wood)
for dd in [2.9,3.4,3.9,4.4,4.9,5.1]: box('Pergola beam',11,dd,4.1,3.9,.14,.17,wood)
beam('Telescope mount',(11,4,1.9),(11,4,2.8),.09,gold)
for xx,dd in [(10.4,3.6),(11.6,3.6),(11,4.6)]: beam('Telescope tripod',(xx,dd,1.9),(11,4,2.8),.045,gold)
beam('Lookout telescope',(10.5,4.2,2.7),(11.6,3.8,3.4),.18,roof)
beam('Telescope brass rim',(11.45,3.85,3.3),(11.6,3.8,3.4),.21,gold)
lamp(12.6,5.0,1.85)
cliff(10,-1.5,3.3,2.7)

# Observatory drum, galleries, warm recessed windows and architectural ribs.
x,d,h=0,-3.5,3.8
for r,z,dep,m in [(3.4,.12,.32,trim),(3.18,1.5,2.8,stone),(3.48,2.95,.22,trim),(3.5,3.12,.13,gold),(3.10,3.9,1.4,stone),(3.35,4.64,.18,trim)]:
    cyl('Observatory architecture',x,d,h+z,r,dep,m,vertices=48)
for i in range(18):
    a=i*math.tau/18
    px=x+math.cos(a)*3.205; pd=d+math.sin(a)*3.205
    o=box('Luminous archive window',px,pd,h+1.55,.47,.07,1.48,window,bevel=.03,angle=math.pi/2-a)
    for zz in [-.6,0,.6]:
        box('Window crossbar',px*1.002,d+(pd-d)*1.002,h+1.55+zz,.52,.09,.055,gold,angle=math.pi/2-a)
    beam('Archive stone rib',(math.cos(a)*3.25,d+math.sin(a)*3.25,h+.35),(math.cos(a)*3.25,d+math.sin(a)*3.25,h+2.8),.085,trim)
    box('Upper gallery window',math.cos(a)*3.13,d+math.sin(a)*3.13,h+3.9,.55,.06,.6,window,angle=math.pi/2-a)
# Open dome panels reveal the instrument inside.
verts=[]; faces=[]
for j in range(24):
    a=j*math.tau/24; b=(j+1)*math.tau/24
    if 0<a<math.pi*.53: continue
    for k in range(9):
        t=k*math.pi/18; tt=(k+1)*math.pi/18
        ids=[]
        for aa,tv in [(a,t),(b,t),(b,tt),(a,tt)]:
            ids.append(len(verts)); verts.append(coord(3.15*math.cos(tv)*math.cos(aa),d+3.15*math.cos(tv)*math.sin(aa),h+4.75+3.15*math.sin(tv)))
        faces.append(tuple(ids))
mesh=bpy.data.meshes.new('Segmented dome');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('Open observatory dome',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(roof)
for a in [0,math.pi*.55,math.pi,math.pi*1.5]:
    prev=None
    for k in range(15):
        t=k*math.pi/28; p=(3.18*math.cos(t)*math.cos(a),d+3.18*math.cos(t)*math.sin(a),h+4.74+3.18*math.sin(t))
        if prev: beam('Dome structural seam',prev,p,.055,trim)
        prev=p
cyl('Orrery pedestal',0,d,h+5.05,.4,.65,gold)
for rot in [(0,0,0),(math.pi/2,.5,0),(.8,.8,0)]: torus('Celestial instrument',0,d,h+6,1.25,.035,window,rot)
sphere('Knowledge star',0,d,h+6,.25,window)
# Foreground entrance and descending staircase.
box('Archive door',0,d+3.2,h+1.1,1.0,.1,1.8,window,bevel=.1)
box('Door lintel',0,d+3.3,h+2.05,1.4,.3,.18,trim)
walkway((-1,7.0,.5),(-1,1.0,3.8),1.9,True)
walkway((-7,3.5,1.6),(-3,6.5,.5),1.4)
walkway((1.2,7,.5),(6,6.5,.8),1.7)
walkway((-3,-5.8,3.8),(-7.5,-6.5,5),1.3)
walkway((3,-5.8,3.8),(5.5,-7,5),1.3)
walkway((3,-2,3.8),(8,-1.5,3.3),1.4)
walkway((8,1.0,3.3),(10,3.0,1.65),1.2)

# Greenhouse with visible roof ribs and worktables.
box('Learning greenhouse base',10,-1.5,3.5,3.5,2.6,.3,trim,bevel=.06)
box('Greenhouse glazing',10,-1.5,4.3,3.3,2.4,1.4,glass)
for xx in [8.4,9.2,10,10.8,11.6]:
    beam('Greenhouse pillar',(xx,-.3,3.6),(xx,-.3,5.0),.045,gold)
    beam('Greenhouse roof',(xx,-.3,5),(xx,-1.5,5.9),.045,gold)
    beam('Greenhouse roof',(xx,-1.5,5.9),(xx,-2.7,5),.045,gold)
    beam('Greenhouse pillar',(xx,-2.7,5),(xx,-2.7,3.6),.045,gold)
beam('Greenhouse ridge',(8.3,-1.5,5.9),(11.7,-1.5,5.9),.06,gold)
for xx in [9,10,11]: box('Learning planter',xx,-.8,4.1,.65,.65,.65,wood); sphere('Greenhouse plant',xx,-.8,4.7,.4,leaves[1])

# Signal receiver with dish, structural truss, tuning equipment.
box('Signal station',-8,3.8,2.25,1.5,1.2,1.3,stone,bevel=.06)
for xx,dd in [(-.65,-.4),(.65,-.4),(0,.6)]:
    beam('Receiver tower',(-8+xx,3.8+dd,2.5),(-8,3.8,6.5),.075,gold)
beam('Receiver axle',(-8,3.8,5.7),(-8,3.8,7.1),.10,trim)
# Dish is a shallow curved mesh facing the front of the scene.
verts=[coord(-8,3.8,6.7)]; faces=[]
for i in range(25):
    a=i*math.tau/24; verts.append(coord(-8+math.cos(a)*1.25,3.8+.45,6.7+math.sin(a)*1.25))
for i in range(24): faces.append((0,i+1,i+2))
me=bpy.data.meshes.new('Receiver dish');me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new('Parabolic signal receiver',me);bpy.context.collection.objects.link(ob);ob.data.materials.append(trim)
beam('Receiver feed',(-8,4.0,6.7),(-8,5.1,6.7),.06,gold)
sphere('Receiver tip',-8,5.1,6.7,.13,cyan)
for xx in [-8.5,-7.8]: box('Receiver console',xx,4.5,2.9,.4,.3,.3,roof,bevel=.03)

# Intake terrace with three real sculptural source plinths.
for xx,dd in [(-2.2,7.6),(-.2,7.7),(1.8,7.6)]:
    cyl('Source plinth',xx,dd,.85,.58,.55,stone,vertices=12)
    torus('Source ring',xx,dd,1.14,.48,.035,cyan)
    cyl('Source bed',xx,dd,1.15,.38,.09,gold,vertices=12)
# Human review desk and source ledger. No automatic stamp.
box('Review counter base',6.6,6.5,1.45,2.7,1.2,1.25,stone,bevel=.06)
box('Review oak desk',6.6,6.5,2.14,3.1,1.5,.18,wood,bevel=.05)
box('Source ledger',6.45,6.6,2.28,.9,.65,.10,paper,angle=.2)
for off in [-.22,-.10,.02,.14]: box('Ledger lines',6.45,6.6+off,2.34,.65,.015,.005,wood,angle=.2)
cyl('Review stamp',7.3,6.55,2.47,.10,.35,wood,vertices=8)
cyl('Stamp foot',7.3,6.55,2.30,.18,.06,gold,vertices=8)
lamp(5.3,6.1,2.2)
# Benches, archive books and overlooked details.
for x,d,h in [(-3,9.5,.5),(4.8,8,.8),(-2,-6.4,3.8)]:
    box('Bench seat',x,d,h+.42,1.5,.5,.13,wood,bevel=.03)
    box('Bench back',x,d-.25,h+.72,1.5,.10,.55,wood)
    for off in [-.55,.55]: box('Bench leg',x+off,d,h+.20,.12,.45,.4,gold)
for i in range(5): box('Reference books',5.7,6.7,2.3+i*.09,.4,.5,.07,[roof,wood,paper][i%3],angle=i*.12)
for x,d,h in [(-3.5,7,.5),(2.7,7,.5),(-2,2.0,3.2),(2,-1,3.8),(-6,3,1.6),(7,8,.8)]: lamp(x,d,h)
# Landscaping. Tree placement stays off the playable paths.
for cx,cd,top,r in [(0,-3.5,3.8,4.9),(-2,7.8,.5,4.3),(-8,3.5,1.6,3.1),(6.7,6.5,.8,3.25),(-9,-6.5,5,2.45),(7,-7,5,2.45),(10,-1.5,3.3,2.7)]:
    for j in range(10):
        a=random.uniform(0,math.tau); rad=r*random.uniform(.73,.97)
        xx=cx+math.cos(a)*rad; dd=cd+math.sin(a)*rad
        if j%2: pine(xx,dd,top,random.uniform(.6,1.15))
        else:
            sphere('Shrub',xx,dd,top+.22,.38,leaves[1],(1,1,.8))
            for k in range(3): sphere('Alpine flower',xx+random.uniform(-.3,.3),dd+random.uniform(-.3,.3),top+.45,.07,petal)
# Tactile details in the first playable segment.
for i,(xx,dd) in enumerate([(-2.2,7.6),(-.2,7.7),(1.8,7.6)]):
    cyl('Source pedestal foot',xx,dd,.61,.65,.09,trim,vertices=12)
    torus('Engraved source band',xx,dd,.79,.585,.018,gold)
    torus('Engraved source band',xx,dd,.96,.585,.018,gold)
    box('Source brass plate',xx,dd+.57,.85,.24,.04,.15,gold,bevel=.015)
# Open reference book, page edges, writing instruments and a physically modelled review sign.
box('Review book cover',6.35,6.7,2.28,1.05,.70,.055,roof,angle=.15)
for direction in [-1,1]:
    book=box('Open reference pages',6.35+direction*.23,6.7,2.35,.47,.63,.07,paper,angle=.15)
    book.rotation_euler[1]=direction*.07
    for k in range(4): box('Page edge',6.35+direction*.23,6.7,2.31+k*.012,.47,.63,.006,trim,angle=.15)
beam('Review pencil',(6.9,6.95,2.26),(7.35,6.83,2.26),.018,gold)
cyl('Ink bottle',5.8,6.4,2.36,.07,.17,roof,vertices=8)
cyl('Ink bottle cap',5.8,6.4,2.47,.055,.05,gold,vertices=8)
bpy.ops.object.text_add(location=coord(6.6,7.115,1.3),rotation=(math.pi/2,0,0))
label=bpy.context.object;label.name='Review desk inscription';label.data.body='HUMAN REVIEW';label.data.align_x='CENTER';label.data.size=.23;label.data.extrude=.002;label.data.materials.append(gold)
bpy.ops.object.convert(target='MESH')
for xx,dd,h in [(-4.0,8.0,.5),(-3.7,9.6,.5),(2.5,9.2,.5),(4.5,7.5,.8),(7.8,5.5,.8)]:
    sphere('Raised alpine bed',xx,dd,h+.07,.52,soil,(1,.7,.25))
    for k in range(7):
        px=xx+random.uniform(-.4,.4);pd=dd+random.uniform(-.28,.28);ht=random.uniform(.25,.48)
        beam('Alpine stem',(px,pd,h+.08),(px,pd,h+ht),.012,leaves[1])
        sphere('Alpine bloom',px,pd,h+ht,.055,petal if k%2 else flower_gold)
        sphere('Alpine leaves',px+.04,pd,h+ht*.6,.07,leaves[1],(1,.5,.5))
for xx,dd,h in [(-3.1,8.6,.5),(5.0,7.5,.8)]:
    box('Reference crate',xx,dd,h+.28,.55,.48,.52,wood,bevel=.025)
    for k in [-1,1]: box('Crate reinforcement',xx+k*.2,dd+.25,h+.28,.035,.03,.52,gold)

# Continuous mountain ridges and conifer groves break the circular terrace outlines.
for x,d,h,r in [(-5,-4,1.2,3),(-3,-8,1.8,3),(4,-7,1.5,2.8),(6,-2,0,3),(4,3,-.5,2.8),(-5,4,-1,2.7),(2,5,-2,3),(-7,-1,-.5,3)]:
    sphere('Mountain bedrock',x,d,h-1.5,r,random.choice(rock),(1,.85,1.6))
for cx,cd,h in [(-5,-4,2.8),(-4,-7,3.6),(4,-7,3.6),(-10,-3,2.8),(5,-1,2.0),(-5,4,.8)]:
    for i in range(7):
        xx=cx+random.uniform(-1.2,1.2);dd=cd+random.uniform(-.8,.8)
        pine(xx,dd,h,random.uniform(.6,1.35))
# Curved gallery rail and carved window surrounds.
for i in range(36):
    a=i*math.tau/36
    beam('Gallery baluster',(math.cos(a)*3.4,-3.5+math.sin(a)*3.4,6.9),(math.cos(a)*3.4,-3.5+math.sin(a)*3.4,7.28),.025,gold)
torus('Gallery handrail',0,-3.5,7.3,3.4,.035,gold)
for i in range(18):
    a=i*math.tau/18
    prev=None
    for k in range(9):
        t=k*math.pi/8
        tangent=(math.cos(t)*.28)
        px=math.cos(a)*3.25-math.sin(a)*tangent
        pd=-3.5+math.sin(a)*3.25+math.cos(a)*tangent
        p=(px,pd,6.05+math.sin(t)*.30)
        if prev: beam('Arched window surround',prev,p,.035,trim)
        prev=p
# Small detached distant crags deepen the silhouette.
for x,d,h,r in [(-13,-3,2,1.5),(13,-6,3,1.4),(-5,-10,3,1.7),(4,-11,3.5,1.7),(-6,11,-.5,1.7),(4,10,-.6,1.3)]:
    cliff(x,d,h,r); pine(x,d,h,.7)

# A continuous mountain foundation anchors the terraces in a landscape.
verts=[coord(0,1,-1.8)]; faces=[]
n=28
for ring in range(3):
    for i in range(n):
        a=i*math.tau/n
        rr=1+random.uniform(-.10,.10)
        rx=[12,11,8.5][ring]; rd=[12.5,11,8][ring]
        elevation=[-3.2,-8,-13][ring]+random.uniform(-.7,.7)
        verts.append(coord(math.cos(a)*rx*rr,1+math.sin(a)*rd*rr,elevation))
for i in range(n): faces.append((0,1+i,1+(i+1)%n))
for ring in range(2):
    for i in range(n):
        a=1+ring*n+i;b=1+ring*n+(i+1)%n;c=1+(ring+1)*n+i;dd=1+(ring+1)*n+(i+1)%n
        faces.extend([(a,c,b),(b,c,dd)])
me=bpy.data.meshes.new('Continuous mountain foundation');me.from_pydata(verts,[],faces);me.update()
ob=bpy.data.objects.new('Mountain foundation',me);bpy.context.collection.objects.link(ob)
for mat in rock: me.materials.append(mat)
for polygon in me.polygons: polygon.material_index=random.randrange(len(rock))
# Split material slots before joining the rest of the authored scene.
bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.selected_objects:
    if o.type=='MESH':
        used=o.data.polygons[0].material_index
        mat=o.data.materials[used]
        o.data.materials.clear();o.data.materials.append(mat)
        for face in o.data.polygons: face.material_index=0
# Foreground crags and plants continue out of frame instead of exposing a display plinth.
for xx,dd,hh,size in [(-6,11,-.3,1.7),(-4,12,-1,1.5),(3,11,-.8,1.8),(6,10,-.4,1.4)]:
    sphere('Foreground crag',xx,dd,hh-.8,size,rock[1],(1,1,1.1))
    pine(xx,dd,hh+.3,1.25)

# World-scale planar UVs keep paving density consistent across terraces and steps.
for o in bpy.context.scene.objects:
    if o.type!='MESH' or not o.data.materials or o.data.materials[0]!=pathmat: continue
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='Paving UV')
    for polygon in o.data.polygons:
        for loop in polygon.loop_indices:
            position=o.matrix_world @ o.data.vertices[o.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(position.x/4.5,position.y/4.5)

# Collapse static meshes into one object per material, preserving flat facets.
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
# Only the paving material samples a texture. Exporting UVs on the other
# materials adds vertex data without changing the rendered surface.
for o in objects:
    if o.data.materials and o.data.materials[0]==pathmat: continue
    for uv in list(o.data.uv_layers): o.data.uv_layers.remove(uv)
for mat in list(bpy.data.materials):
    group=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
    if not group: continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in group: o.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.object.join()
    group[0].name='Campus / '+mat.name
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
print('EXPORTED',OUT,OUT.stat().st_size)
compressed = OUT.with_suffix('.glb.gz')
compressed.write_bytes(gzip.compress(OUT.read_bytes(), compresslevel=9, mtime=0))
print('COMPRESSED',compressed,compressed.stat().st_size)
