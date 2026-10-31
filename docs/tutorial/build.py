import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table,
                                TableStyle, KeepTogether, PageBreak, Flowable, CondPageBreak)

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "fonts")
for name in ["Barlow-Regular", "Barlow-Italic", "Barlow-Medium", "Barlow-SemiBold",
             "BarlowCond-Medium", "BarlowCond-SemiBold", "BarlowCond-Bold"]:
    pdfmetrics.registerFont(TTFont(name, os.path.join(FONTS, name + ".ttf")))
pdfmetrics.registerFontFamily("Barlow", normal="Barlow-Regular", bold="Barlow-SemiBold",
                              italic="Barlow-Italic", boldItalic="Barlow-SemiBold")

# Palette: the playtest UI's pit-wall look (cool neutrals, one orange accent) plus manufacturer liveries.
INK = colors.HexColor("#141a22")
MUTED = colors.HexColor("#5a6573")
LINE = colors.HexColor("#d5dbe2")
PAPER = colors.HexColor("#f4f6f8")
ACCENT = colors.HexColor("#c2410c")
ACCENT_SOFT = colors.HexColor("#fdebe1")
GOOD = colors.HexColor("#1f7a4d")
BAD = colors.HexColor("#b4232a")

W, H = A4
MARGIN = 20 * mm

st = {
    "body": ParagraphStyle("body", fontName="Barlow-Regular", fontSize=10.5, leading=15.2, textColor=INK, spaceAfter=6),
    "intro": ParagraphStyle("intro", fontName="Barlow-Regular", fontSize=10.5, leading=15.2, textColor=INK, spaceAfter=6, keepWithNext=1),
    "lead": ParagraphStyle("lead", fontName="Barlow-Regular", fontSize=13, leading=18.5, textColor=INK, spaceAfter=8),
    "small": ParagraphStyle("small", fontName="Barlow-Regular", fontSize=9, leading=12.5, textColor=MUTED),
    "eyebrow": ParagraphStyle("eyebrow", fontName="BarlowCond-SemiBold", fontSize=9.5, leading=12, textColor=ACCENT, spaceAfter=2, keepWithNext=1),
    "h1": ParagraphStyle("h1", fontName="BarlowCond-Bold", fontSize=26, leading=28, textColor=INK, spaceAfter=8, keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName="BarlowCond-SemiBold", fontSize=15, leading=18, textColor=INK, spaceBefore=8, spaceAfter=4, keepWithNext=1),
    "cell": ParagraphStyle("cell", fontName="Barlow-Regular", fontSize=10, leading=13.6, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="BarlowCond-SemiBold", fontSize=11.5, leading=13.6, textColor=INK),
    "tip": ParagraphStyle("tip", fontName="Barlow-Regular", fontSize=10.5, leading=15, textColor=INK),
}

def P(text, style="body"):
    return Paragraph(text, st[style])

class Rule(Flowable):
    """Short accent bar under a section title."""
    def __init__(self, width=28 * mm, color=ACCENT, thick=2.2):
        super().__init__(); self.w, self.c, self.t = width, color, thick
    def wrap(self, aw, ah):
        return self.w, self.t + 6
    def draw(self):
        self.canv.setFillColor(self.c); self.canv.rect(0, 4, self.w, self.t, stroke=0, fill=1)

class SeasonStrip(Flowable):
    """48 weeks with the four goal races marked: the shape of every season."""
    def __init__(self, width, goals=(12, 24, 36, 46)):
        super().__init__(); self.width, self.goals = width, goals
    def wrap(self, aw, ah):
        return self.width, 34
    def draw(self):
        c = self.canv; n = 48; gap = 1.2; w = (self.width - gap * (n - 1)) / n
        for i in range(n):
            week = i + 1; x = i * (w + gap)
            goal = week in self.goals
            c.setFillColor(ACCENT if goal else LINE)
            c.rect(x, 14, w, 12 if goal else 8, stroke=0, fill=1)
            if goal:
                c.setFillColor(MUTED); c.setFont("BarlowCond-SemiBold", 8)
                c.drawCentredString(x + w / 2, 3, f"semana {week}")
        c.setFillColor(MUTED); c.setFont("BarlowCond-Medium", 8)
        c.drawString(0, 29, "SEMANA 1"); c.drawRightString(self.width, 29, "SEMANA 48")

class VigorGauge(Flowable):
    """A tank that empties: full is safe, the bottom is where trainings start to fail."""
    def __init__(self, width):
        super().__init__(); self.width = width
    def wrap(self, aw, ah):
        return self.width, 46
    def draw(self):
        c = self.canv; bw = self.width; y = 16; h = 14
        steps = 40
        for i in range(steps):
            t = i / (steps - 1)  # 0 = empty (left), 1 = full (right)
            col = colors.Color(BAD.red + (GOOD.red - BAD.red) * t, BAD.green + (GOOD.green - BAD.green) * t,
                               BAD.blue + (GOOD.blue - BAD.blue) * t)
            c.setFillColor(col); c.rect(i * bw / steps, y, bw / steps + 0.4, h, stroke=0, fill=1)
        c.setStrokeColor(INK); c.setLineWidth(0.8); c.rect(0, y, bw, h, stroke=1, fill=0)
        c.setFont("BarlowCond-SemiBold", 9); c.setFillColor(INK)
        c.drawString(0, 4, "VACÍO: casi seguro que sale mal")
        c.drawRightString(bw, 4, "LLENO: entrena sin riesgo")
        c.drawString(0, y + h + 5, "VIGOR")

class MoodScale(Flowable):
    """Five mood levels as blocks, from the floor to radiant."""
    LEVELS = ["Por el piso", "Baja", "Normal", "Bien", "Radiante"]
    def __init__(self, width):
        super().__init__(); self.width = width
    def wrap(self, aw, ah):
        return self.width, 40
    def draw(self):
        c = self.canv; n = 5; gap = 4; w = (self.width - gap * (n - 1)) / n
        shades = [BAD, colors.HexColor("#d9822b"), colors.HexColor("#8a96a3"), colors.HexColor("#3a9a6a"), GOOD]
        for i, label in enumerate(self.LEVELS):
            x = i * (w + gap)
            c.setFillColor(shades[i]); c.roundRect(x, 14, w, 18, 3, stroke=0, fill=1)
            c.setFillColor(colors.white); c.setFont("BarlowCond-SemiBold", 10)
            c.drawCentredString(x + w / 2, 19.5, label.upper())
        c.setFillColor(MUTED); c.setFont("Barlow-Regular", 8.5)
        c.drawString(0, 2, "entrena y corre peor"); c.drawRightString(self.width, 2, "entrena y corre mejor")

class Swatch(Flowable):
    """Two-colour livery chip, as in the game."""
    def __init__(self, a, b, size=11):
        super().__init__(); self.a, self.b, self.s = colors.HexColor(a), colors.HexColor(b), size
    def wrap(self, aw, ah):
        return self.s * 1.6, self.s
    def draw(self):
        c = self.canv; s = self.s
        c.setFillColor(self.a); c.rect(0, 0, s * 0.8, s, stroke=0, fill=1)
        c.setFillColor(self.b); c.rect(s * 0.8, 0, s * 0.8, s, stroke=0, fill=1)

def table(rows, widths, head=None, zebra=True):
    data = []
    if head:
        data.append([P(h, "eyebrow") for h in head])
    data += rows
    t = Table(data, colWidths=widths, hAlign="LEFT", splitByRow=0)
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6),
             ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 5),
             ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE)]
    if head:
        style.append(("LINEBELOW", (0, 0), (-1, 0), 1.2, INK))
    t.setStyle(TableStyle(style))
    return t

def tip(text, label="CONSEJO"):
    inner = [P(label, "eyebrow"), P(text, "tip")]
    t = Table([[inner]], colWidths=[W - 2 * MARGIN])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT_SOFT), ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
                           ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 8)])

def section(num, eyebrow, title):
    rule, gap = Rule(), Spacer(1, 6)
    rule.keepWithNext = 1  # the heading travels with the first paragraph (and table) of its section
    gap.keepWithNext = 1
    return [CondPageBreak(60 * mm), P(f"{num:02d} · {eyebrow}", "eyebrow"), P(title, "h1"), rule, gap]

def on_page(c, doc):
    c.saveState()
    c.setFillColor(MUTED); c.setFont("BarlowCond-Medium", 8.5)
    c.drawString(MARGIN, 11 * mm, "FALCONESS (NOMBRE PROVISIONAL) · CÓMO SE JUEGA · BORRADOR PARA LA VERSIÓN 1.0")
    c.drawRightString(W - MARGIN, 11 * mm, str(doc.page))
    c.setStrokeColor(LINE); c.setLineWidth(0.6); c.line(MARGIN, 14 * mm, W - MARGIN, 14 * mm)
    c.restoreState()

def on_cover(c, doc):
    c.saveState()
    c.setFillColor(INK); c.rect(0, H - 92 * mm, W, 92 * mm, stroke=0, fill=1)
    # liveries of the five manufacturers along the band's lower edge
    livs = [("#4a5a6a", "#c8d0d8"), ("#f5f0e1", "#c9a227"), ("#c0392b", "#f1c40f"), ("#1b2a49", "#2ec4f1"), ("#8b4513", "#6b7b3a")]
    bw = W / len(livs)
    for i, (a, b) in enumerate(livs):
        c.setFillColor(colors.HexColor(a)); c.rect(i * bw, H - 92 * mm, bw / 2, 3.2 * mm, stroke=0, fill=1)
        c.setFillColor(colors.HexColor(b)); c.rect(i * bw + bw / 2, H - 92 * mm, bw / 2, 3.2 * mm, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#f97316")); c.setFont("BarlowCond-SemiBold", 11)
    c.drawString(MARGIN, H - 26 * mm, "GUÍA DE LA TEMPORADA · BORRADOR PARA LA VERSIÓN 1.0")
    c.setFillColor(colors.white); c.setFont("BarlowCond-Bold", 64)
    c.drawString(MARGIN - 1, H - 52 * mm, "FALCONESS")
    c.setFont("BarlowCond-Medium", 26); c.setFillColor(colors.HexColor("#cfd6de"))
    c.drawString(MARGIN, H - 66 * mm, "Cómo se juega")
    c.setFont("Barlow-Regular", 9.5); c.setFillColor(colors.HexColor("#9aa6b2"))
    c.drawString(MARGIN, H - 79 * mm, "Nombre provisional. Describe el juego como está planeado para la 1.0; las pruebas pueden cambiar detalles.")
    c.restoreState()
    on_page(c, doc)

def build(out):
    doc = BaseDocTemplate(out, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN,
                          bottomMargin=20 * mm, title="Falconess: cómo se juega", author="Falconess",
                          subject="Tutorial de mecánicas para la versión 1.0")
    cover_frame = Frame(MARGIN, 20 * mm, W - 2 * MARGIN, H - 92 * mm - 30 * mm, id="cover")
    frame = Frame(MARGIN, 20 * mm, W - 2 * MARGIN, H - MARGIN - 20 * mm, id="body")
    doc.addPageTemplates([PageTemplate("cover", [cover_frame], onPage=on_cover),
                          PageTemplate("body", [frame], onPage=on_page)])
    CW = W - 2 * MARGIN
    s = []
    from reportlab.platypus.doctemplate import NextPageTemplate
    s.append(NextPageTemplate("body"))

    # --- cover body
    s += [P("EN UNA FRASE", "eyebrow"),
          P("Entrenás a una corredora con alas mecánicas durante una temporada. Cada semana decidís qué "
            "hace. En las carreras vuela sola, con el cuerpo y las alas que le preparaste.", "lead"),
          Spacer(1, 8), P("LA FORMA DE UNA TEMPORADA", "eyebrow"), SeasonStrip(CW), Spacer(1, 10),
          P("Una temporada dura <b>48 semanas</b>. Cuatro de ellas son <b>carreras objetivo</b>: cada una pide "
            "terminar en un puesto mínimo. Si lo lográs, seguís; si no, la temporada termina ahí."),
          Spacer(1, 6), P("TRES PASOS", "eyebrow"),
          table([[P("1", "cellb"), P("<b>Elegís corredora y alas.</b> Cada corredora tiene su carácter y sus "
                                     "objetivos; las alas definen cómo vuela.", "cell")],
                 [P("2", "cellb"), P("<b>Cada semana elegís una acción.</b> Entrenar, descansar, salir o ir al "
                                     "taller.", "cell")],
                 [P("3", "cellb"), P("<b>Llegás a cada carrera lo mejor preparada posible.</b> Ahí ella decide "
                                     "cuándo acelerar y cuándo guardar fuerzas.", "cell")]],
                [12 * mm, CW - 12 * mm]),
          PageBreak()]

    # --- 1. corredora
    s += section(1, "TU CORREDORA", "Cinco cualidades")
    s += [P("Cada corredora tiene cinco cualidades. Entrenar las sube; en la carrera, cada una ayuda en un "
            "momento distinto.", "intro")]
    s.append(table([
        [P("Agilidad", "cellb"), P("Qué tan rápido vuela. También ayuda a tomar mejor las curvas.", "cell")],
        [P("Resistencia", "cellb"), P("Cuánto aguanta antes de quedarse sin <b>físico</b>. Sin físico, vuela lento "
                                      "hasta la meta.", "cell")],
        [P("Técnica", "cellb"), P("Arranques, saltos y aterrizajes. Una corredora técnica recupera velocidad "
                                  "más rápido.", "cell")],
        [P("Coraje", "cellb"), P("Aguanta el calor de las alas y el desgaste del tramo final.", "cell")],
        [P("Inteligencia", "cellb"), P("Elige mejor el ritmo, planea mejor el sprint final y activa más sus "
                                       "habilidades.", "cell")],
    ], [34 * mm, CW - 34 * mm], head=["CUALIDAD", "PARA QUÉ SIRVE EN CARRERA"]))
    s += [Spacer(1, 8), P("Aptitudes", "h2"),
          P("Cada corredora rinde mejor con ciertos <b>estilos de vuelo</b>. Se marcan con una letra, de la "
            "<b>S</b> (ideal) a la <b>G</b> (muy incómoda). Volar con su estilo la hace rendir más sin entrenar "
            "nada extra."),
          P("Habilidades", "h2"),
          P("Son trucos que se activan solos en carrera cuando se da la situación: una bajada, el tramo final, ir "
            "en el medio del grupo. Cada corredora trae una <b>habilidad única</b> y puede aprender otras en el "
            "taller. Con más Inteligencia, se activan más seguido."),
          tip("Mirá las letras antes de elegir: una corredora con <b>A</b> en Picada ya parte con ventaja si "
              "vuela con alas de Picada.")]

    # --- 2. alas
    s += section(2, "LAS ALAS", "Bastidores, fabricantes y estilos")
    s += [P("Las alas se llaman <b>bastidores</b>. Cada uno es de un fabricante, y cada fabricante tiene su "
            "manera de volar. No hay alas \"mejores\": hay alas mejores para cada pista y cada corredora.", "intro")]
    mf = [("#4a5a6a", "#c8d0d8", "Steinhaus", "Pesadas y robustas. Aguantan el calor sin frenar, pero se desgastan si se pasan."),
          ("#f5f0e1", "#c9a227", "Lumière", "Livianas. Recargan energía cuando no aceleran; sufren en los aterrizajes."),
          ("#c0392b", "#f1c40f", "Kōryū", "Aceleran en ráfagas cortas y potentes. Brillan en las bajadas."),
          ("#1b2a49", "#2ec4f1", "Altair", "Computadora de vuelo: nunca se recalientan y activan más habilidades."),
          ("#8b4513", "#6b7b3a", "Boneyard", "Chatarra reforzada. Se reparan solas en los tramos llanos y traen rarezas al azar.")]
    s.append(table([[Swatch(a, b), P(n, "cellb"), P(d, "cell")] for a, b, n, d in mf],
                   [12 * mm, 26 * mm, CW - 38 * mm], head=["", "FABRICANTE", "CÓMO VUELA"]))
    s += [Spacer(1, 8), P("Estilos de vuelo", "h2"),
          P("Cada bastidor tiene un estilo, que es la forma en que la corredora administra la carrera.", "intro"),
          table([[P("Picada", "cellb"), P("Guarda fuerzas y lo gasta todo en las bajadas y en el sprint final.", "cell")],
                 [P("Suspensión", "cellb"), P("Viaja en el medio del grupo, aprovecha el rebufo y ataca tarde.", "cell")],
                 [P("Planeo", "cellb"), P("Sale adelante desde el principio y trata de no soltar la punta.", "cell")],
                 [P("Rasante", "cellb"), P("Vuela bajo y constante; rodea los saltos por tierra y resiste los golpes.", "cell")]],
                [30 * mm, CW - 30 * mm]),
          Spacer(1, 8), P("El hangar y las cuadrillas", "h2"),
          P("Antes de empezar elegís hasta <b>cuatro bastidores</b> para tu hangar. Durante la temporada podés "
            "cambiar de alas en el taller. Cada fabricante del hangar trae su <b>cuadrilla</b>: a veces aparece en "
            "un entrenamiento y ese entrenamiento rinde más. Cuanto más trabajás con una cuadrilla, más vínculo "
            "tienen, más seguido aparece y más historias suyas vas a ver."),
          P("Cada corredora tiene además unas <b>alas firma</b>, hechas por su patrocinador, con un detalle que "
            "encaja con su forma de volar."),
          tip("Un hangar con muchas marcas te da ayuda en más cualidades; un hangar de una sola marca hace crecer "
              "mucho ese vínculo. Las dos estrategias valen.")]

    # --- 3. semana
    s += section(3, "LA SEMANA", "Una decisión por semana")
    s += [P("Cada semana elegís una sola acción. Antes de hacerla, el juego te muestra qué vas a ganar, qué cuadrilla "
            "está presente y qué riesgo corrés.", "intro")]
    s.append(table([
        [P("Entrenar", "cellb"), P("Sube una cualidad (y un poco otra relacionada). Gasta vigor. Hay cinco: agilidad, "
                                   "resistencia, técnica, el <b>vuelo de riesgo</b> (mucho coraje, más riesgo) y el "
                                   "<b>simulador</b> (inteligencia y puntos de habilidad; en vez de cansar, recupera un "
                                   "poco de vigor).", "cell")],
        [P("Descansar", "cellb"), P("Recupera mucho vigor. A veces también mejora el ánimo.", "cell")],
        [P("Salir", "cellb"), P("Un día libre con una cuadrilla: mejora el ánimo, recupera algo de vigor y suma "
                                "vínculo con esa cuadrilla.", "cell")],
        [P("Taller", "cellb"), P("Cambiar de alas, instalar piezas, reparar o aprender habilidades. Todo junto "
                                 "ocupa la semana.", "cell")],
    ], [30 * mm, CW - 30 * mm], head=["ACCIÓN", "QUÉ HACE"]))
    s += [Spacer(1, 6),
          P("Al terminar la semana se abre una ventana con <b>lo que pasó</b>: si el entrenamiento salió bien o "
            "falló, cuánto subió cada cualidad y por qué cambiaron el vigor y el ánimo."),
          Spacer(1, 4), CondPageBreak(70 * mm), P("Vigor", "h2"),
          P("El vigor es la energía para entrenar. <b>Entrenar lo gasta y descansar lo recarga.</b> Mientras tengas "
            "vigor de sobra, los entrenamientos salen bien. Cuando el tanque baja, empiezan a fallar: un "
            "entrenamiento fallido no sube nada, puede bajar una cualidad y baja el ánimo. Con el tanque casi vacío, "
            "la corredora puede lesionarse y perder semanas."),
          VigorGauge(CW), Spacer(1, 6),
          P("Nadie te obliga a descansar: la decisión es tuya. Arriesgar un entrenamiento con poco vigor puede "
            "valer la pena si aparece la cuadrilla justa, pero si fallás, lo pagás."),
          P("Ánimo", "h2"),
          P("El ánimo va de <b>por el piso</b> a <b>radiante</b>. Con buen ánimo, la corredora aprovecha mucho más "
            "cada entrenamiento y vuela mejor en carrera; con mal ánimo, rinde bastante menos. El ánimo baja si "
            "encadenás muchas semanas de entrenamiento sin parar, si fallás un entrenamiento o con algunos eventos. "
            "Sube con salidas, descansos y buenas noticias."),
          MoodScale(CW), Spacer(1, 4),
          tip("El ritmo es la clave: entrená fuerte mientras el vigor alcanza, frená antes de que se vacíe y no "
              "dejes que el ánimo se caiga. Una salida a tiempo suele rendir más que un entrenamiento cansado.")]

    # --- 4. eventos
    s += section(4, "EVENTOS", "La vida en el hangar")
    s += [P("Algunas semanas pasa algo. Hay tres tipos de eventos:", "intro"),
          table([[P("Historias", "cellb"), P("Momentos de tu corredora: cómo piensa, qué la preocupa. Suelen pedirte "
                                             "que elijas cómo responder.", "cell")],
                 [P("Cuadrillas", "cellb"), P("Ideas, sesiones de datos o reparaciones de la gente de cada fabricante. "
                                              "Aparecen más cuanto mayor es el vínculo.", "cell")],
                 [P("Al azar", "cellb"), P("Sorpresas buenas o malas: una buena noticia puede darle cualidades, vigor "
                                           "o ánimo; un contratiempo puede bajarle el ánimo o el vigor.", "cell")]],
                [30 * mm, CW - 30 * mm]),
          Spacer(1, 6),
          P("Cuando un evento te deja elegir, cada respuesta tiene su consecuencia. A veces la opción segura da poco "
            "y la arriesgada puede salir muy bien o muy mal: el juego te avisa cuando hay azar de por medio."),
          tip("El vínculo abre historias: cuanto más trabajás con una cuadrilla, más eventos suyos aparecen, y "
              "suelen ser de los que ayudan.")]

    # --- 5. taller
    s += section(5, "EL TALLER", "Preparar las alas para cada pista")
    s.append(table([
        [P("Cambiar de alas", "cellb"), P("Elegí del hangar el bastidor que mejor encaja con la próxima carrera.", "cell")],
        [P("Piezas", "cellb"), P("Turbinas, baterías, estabilizadores y firmware. Son ajustes finos: cada pieza "
                                 "ayuda en algo y suele costar en otra cosa.", "cell")],
        [P("Reparar", "cellb"), P("Las alas se desgastan con el calor, el agua y los golpes. Repararlas evita "
                                  "llegar a una carrera con las alas al límite.", "cell")],
        [P("Rarezas", "cellb"), P("Los bastidores Boneyard traen rarezas al azar. Con <b>chatarra</b>, que ganás "
                                  "corriendo, podés volver a sortearlas.", "cell")],
        [P("Habilidades", "cellb"), P("Con <b>puntos de habilidad</b>, que da el simulador, aprendés habilidades "
                                      "nuevas para la carrera.", "cell")],
    ], [34 * mm, CW - 34 * mm], head=["EN EL TALLER", "PARA QUÉ"]))
    s += [Spacer(1, 4), tip("Pasá por el taller la semana antes de una carrera: alas para esa pista y una habilidad "
                            "que se active en su terreno pueden ser la diferencia.")]

    # --- 6. carreras
    s += section(6, "LAS CARRERAS", "Ella vuela, vos la preparaste")
    s += [P("En las carreras objetivo vuelan ocho corredoras. Tu corredora decide sola cuándo acelerar, cuándo "
            "guardar energía y cuándo lanzar el sprint final. Lo que hiciste durante las semanas anteriores es lo que "
            "lleva a la pista."),
          P("Las pistas", "h2"),
          P("Cada pista mezcla tramos distintos, y cada tramo premia algo diferente.", "intro"),
          table([[P("Llano", "cellb"), P("Velocidad pura.", "cell")],
                 [P("Subida y bajada", "cellb"), P("Las subidas frenan; las bajadas son el lugar para atacar.", "cell")],
                 [P("Salto", "cellb"), P("Hace falta energía y técnica para cruzarlo volando. El estilo Rasante lo "
                                         "rodea por tierra.", "cell")],
                 [P("Agua", "cellb"), P("Frena y castiga a las alas.", "cell")],
                 [P("Cañón", "cellb"), P("El viento empuja o frena según el tramo.", "cell")],
                 [P("Curvas", "cellb"), P("Las corredoras ágiles las toman sin perder tanto.", "cell")]],
                [34 * mm, CW - 34 * mm]),
          Spacer(1, 8), CondPageBreak(55 * mm), P("Lo que se gasta en el aire", "h2"),
          table([[P("Físico", "cellb"), P("Se gasta volando. Si se acaba, la corredora sigue pero muy lento. "
                                          "Resistencia y Coraje lo cuidan.", "cell")],
                 [P("Energía", "cellb"), P("Combustible de las alas para acelerar y para saltar.", "cell")],
                 [P("Calor", "cellb"), P("Sube al acelerar. Si se pasa de la cuenta, frena y daña las alas.", "cell")],
                 [P("Alas", "cellb"), P("Si se rompen en plena carrera, vuela mucho más lento hasta la meta.", "cell")]],
                [34 * mm, CW - 34 * mm]),
          Spacer(1, 8), P("Después de la carrera", "h2"),
          P("Podés ver la repetición completa y un resumen de por qué ganó o perdió cada una. Si terminás tercera o "
            "peor, el equipo te deja un consejo, por ejemplo: <i>se quedó sin físico antes de la meta; quizás deberías "
            "entrenar Resistencia</i>."),
          tip("Antes de cada carrera mirá el terreno: muchas bajadas piden alas de Picada y Kōryū; pistas largas "
              "piden Resistencia; mucha curva pide Agilidad.")]

    # --- 7. fin
    s += section(7, "FIN DE TEMPORADA", "La nota y la caja negra")
    s += [P("Al terminar las 48 semanas, o antes si no llegaste a un objetivo, la temporada recibe una <b>nota</b>. "
            "Cuenta cómo quedaron sus cualidades, cuántas carreras ganó y qué habilidades aprendió."),
          P("Además se graba su <b>caja negra</b>: lo mejor que logró esa corredora (su cualidad más alta, su mejor "
            "aptitud y algunas habilidades). En la próxima temporada podés elegir dos cajas negras como herencia, y la "
            "nueva corredora arranca con parte de ese aprendizaje."),
          tip("Una temporada que no salió perfecta igual deja una caja negra útil. Cada temporada prepara la "
              "siguiente.")]

    # --- 8. consejos
    s += section(8, "PARA EMPEZAR", "Cinco consejos para tu primera temporada")
    tips = ["Mirá siempre la próxima carrera objetivo: su terreno te dice qué entrenar.",
            "No dejes que el vigor toque fondo. Descansar a tiempo es parte de entrenar.",
            "Cuidá el ánimo: una corredora contenta aprovecha mucho más cada semana.",
            "Entrená lo que esté pidiendo ayuda cuando aparezca una cuadrilla: es la semana que más rinde.",
            "Visitá el taller antes de cada carrera: alas para la pista y una habilidad nueva."]
    s.append(table([[P(str(i + 1), "cellb"), P(t, "cell")] for i, t in enumerate(tips)], [12 * mm, CW - 12 * mm]))
    doc.build(s)

if __name__ == "__main__":
    build(sys.argv[1])
