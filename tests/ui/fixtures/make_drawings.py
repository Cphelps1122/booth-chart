from pptx import Presentation
from pptx.util import Pt
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from reportlab.pdfgen import canvas
# play in "yards": x left/right of ball, y up = downfield. offense below the line
S=10  # points per yard on the page
def plays():
    off=[(-4.2,-.9,'sq'),(-2.1,-.9,'c'),(0,-.9,'sq'),(2.1,-.9,'c'),(4.2,-.9,'c'),(0,-4.5,'c'),(-18,-1,'c'),(-9,-1.5,'c'),(6.3,-1,'c'),(18,-1,'c'),(0,-7,'c')]
    pas={'name':'GOLD MESH','routes':{6:[(0,0),(0,18)],7:[(0,0),(0,2),(13,4)],8:[(0,0),(0,2),(-13,5)],9:[(0,0),(0,10),(-5,16)],10:[(0,0),(-4,1),(-8,3)]},
         'def':[('E',-5.5,1),('T',-1.5,1),('N',1.5,1),('E',5.5,1),('M',0,5),('W',-4,5),('C',-18,7),('C',18,7),('$',9,4),('S',-6,12),('F',6,12)]}
    run={'name':'SPLIT ZONE','routes':{0:[(0,0),(-1.5,1.5)],1:[(0,0),(-1,1.6)],2:[(0,0),(.4,1.8)],3:[(0,0),(1,1.8)],4:[(0,0),(1.6,1.4)],8:[(0,0),(-5,.6),(-8,1.4)],10:[(0,0),(2,3),(1,6)]},
         'def':[('E',-5.5,1),('T',-1.5,1),('N',1.5,1),('E',5.5,1),('M',0,5),('W',-4,5),('C',-18,7),('C',18,7),('$',9,4),('S',-6,12),('F',6,12)]}
    return off,[pas,run]
off,PL=plays()
W,H=720,540; BX,BY=360,330
P=lambda x,y:(BX+x*S, BY-y*S)
# pptx (y down)
pr=Presentation(); pr.slide_width=Pt(W); pr.slide_height=Pt(H)
for pl in PL:
    sl=pr.slides.add_slide(pr.slide_layouts[5]); sl.shapes.title.text=pl['name']
    for i,(x,y,k) in enumerate(off):
        px,py=P(x,y); sh=sl.shapes.add_shape(MSO_SHAPE.RECTANGLE if k=='sq' else MSO_SHAPE.OVAL, Pt(px-7),Pt(py-7),Pt(14),Pt(14))
    for i,rt in pl['routes'].items():
        x0,y0,_=off[i]
        for a,b in zip(rt,rt[1:]):
            p1=P(x0+a[0],y0+a[1]); p2=P(x0+b[0],y0+b[1]); sl.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,Pt(p1[0]),Pt(p1[1]),Pt(p2[0]),Pt(p2[1]))
    for (t,x,y) in pl['def']:
        px,py=P(x,y); tb=sl.shapes.add_textbox(Pt(px-8),Pt(py-9),Pt(16),Pt(18)); tb.text_frame.text=t
pr.save('drawings.pptx')
# pdf (reportlab y up)
c=canvas.Canvas('drawings.pdf',pagesize=(W,H))
for pl in PL:
    c.setFont('Helvetica-Bold',24); c.drawString(40,H-50,pl['name'])
    for i,(x,y,k) in enumerate(off):
        px,py=P(x,y); py=H-py
        if k=='sq': c.rect(px-7,py-7,14,14)
        else: c.circle(px,py,7)
    for i,rt in pl['routes'].items():
        x0,y0,_=off[i]; pts=[P(x0+a[0],y0+a[1]) for a in rt]
        p=c.beginPath(); p.moveTo(pts[0][0],H-pts[0][1])
        for q in pts[1:]: p.lineTo(q[0],H-q[1])
        c.drawPath(p,stroke=1,fill=0)
        # arrowhead
        e=pts[-1]; c.setFillGray(0); ah=c.beginPath(); ah.moveTo(e[0],H-e[1]); ah.lineTo(e[0]-3,H-e[1]-4); ah.lineTo(e[0]+3,H-e[1]-4); ah.close(); c.drawPath(ah,stroke=0,fill=1)
    c.setFont('Helvetica-Bold',13)
    for (t,x,y) in pl['def']:
        px,py=P(x,y); c.drawCentredString(px,H-py-4,t)
    c.showPage()
c.save()
