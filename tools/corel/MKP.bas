Attribute VB_Name = "MKP"
Option Explicit

' Macros do Mockup da Agenda para o CorelDRAW.
'  - ArteDoClienteNoMolde: abre uma COPIA do molde, encaixa a frente (pagina 1) e o verso (pagina 2) sem distorcer e salva "<arte> - MOLDE.cdr" na pasta do cliente.
'  - ExportarPDFparaMKP:   salva o PDF (predefinicao "MKP") ao lado do .cdr aberto.
' O app chama os dois por um botao; rodando a mao tambem funciona.
'  - AnuncioNoMolde / AnuncioDaPasta: monta o .cdr do anuncio (varias capas + codigo de barras EAN). Ver o bloco ANUNCIO 2027 no fim.

Const MOLDE As String = "C:\MOLDE\MOLDE.cdr"
' A arte do cliente entra no quadrado MENOR do molde (150 x 210 mm). A area maior (195 x 255, com a dobra) o designer completa a mao.
Const LARGURA As Double = 150
Const ALTURA As Double = 210
Const CENTRO_X As Double = 104.951
Const CENTRO_Y As Double = 148.343
Const IDADE_MAXIMA_MIN As Long = 10

' O que foi feito, para o app mostrar a confirmacao (frente=OK 150,0 x 210,0 mm / verso=SEM / existente=1).
Private resultado As String

' --- Anuncio 2027: medidas do desenho do EAN-13, as mesmas de src/anuncios/ean.ts (layoutEan13), em unidades do desenho de 543 x 189.
Const EAN_LARGURA As Double = 543
Const EAN_ALTURA As Double = 189
Const EAN_MODULO As Double = 4.35
Const EAN_BARRA_Y As Double = 18
Const EAN_ALTURA_NORMAL As Double = 92
Const EAN_ALTURA_GUARDA As Double = 104
Const EAN_Y_DIGITOS As Double = 158
Const EAN_TAMANHO_DIGITOS As Double = 24
Const EAN_X_PRIMEIRO_DIGITO As Double = 43
' Largura do modulo, em mm, no EAN-13 a 100%.
Const EAN_MODULO_MM_100 As Double = 0.33
' Altura de um algarismo da Arial, em fracao do tamanho da fonte (para pousar os digitos na linha de base y=158).
Const EAN_ALTURA_ALGARISMO As Double = 0.716

Private Sub GravarResultado()
    Dim n As Integer
    On Error Resume Next
    n = FreeFile
    Open Environ("TEMP") & "\mockup-resultado.txt" For Output As #n
    Print #n, resultado
    Close #n
End Sub

' Le o arquivo que o app deixou na pasta temporaria (uma informacao por linha) e apaga o arquivo.
' Arquivo velho (mais de 10 minutos) e ignorado, para nunca usar um caminho de outra hora.
Private Function LerLinhasEApagar(nome As String) As String()
    Dim caminho As String, linha As String, n As Integer, i As Integer
    Dim r(0 To 2) As String
    caminho = Environ("TEMP") & "\" & nome
    LerLinhasEApagar = r
    If Dir(caminho) = "" Then Exit Function
    If DateDiff("n", FileDateTime(caminho), Now) > IDADE_MAXIMA_MIN Then
        On Error Resume Next
        Kill caminho
        Exit Function
    End If
    n = FreeFile
    Open caminho For Input As #n
    Do While Not EOF(n) And i <= 2
        Line Input #n, linha
        r(i) = Trim(linha)
        i = i + 1
    Loop
    Close #n
    On Error Resume Next
    Kill caminho
    LerLinhasEApagar = r
End Function

Private Function LerEApagar(nome As String) As String
    Dim l() As String
    l = LerLinhasEApagar(nome)
    LerEApagar = l(0)
End Function

Private Function SemBarraFinal(ByVal s As String) As String
    s = LCase(Trim(s))
    Do While Right(s, 1) = "\"
        s = Left(s, Len(s) - 1)
    Loop
    SemBarraFinal = s
End Function

Private Function EscolherArte() As String
    Dim r As String
    On Error Resume Next
    r = Application.GetFileBox("Arquivos de arte|*.pdf;*.png;*.jpg;*.jpeg;*.tif;*.tiff", "Escolha a arte do cliente", 0)
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        r = InputBox("Cole o caminho completo do arquivo da arte do cliente:", "Arte no molde")
    End If
    EscolherArte = Replace(r, Chr(34), "")
End Function

' Importa a arte na pagina indicada do molde (1 = frente, 2 = verso), encaixa sem distorcer e centraliza.
Private Sub ColocarArte(doc As Document, pagina As Long, arquivo As String, chave As String)
    Dim s As Shape, f As Double, f2 As Double
    If doc.Pages.Count < pagina Then Err.Raise vbObjectError + 1, , "O molde nao tem a pagina " & pagina & "."
    doc.Pages(pagina).Activate
    doc.Pages(pagina).ActiveLayer.Import arquivo
    Set s = ActiveSelection
    f = LARGURA / s.SizeWidth
    f2 = ALTURA / s.SizeHeight
    If f2 < f Then f = f2
    s.SetSize s.SizeWidth * f, s.SizeHeight * f
    s.CenterX = CENTRO_X
    s.CenterY = CENTRO_Y
    s.OrderToBack
    resultado = resultado & chave & "=OK " & Format(s.SizeWidth, "0.0") & " x " & Format(s.SizeHeight, "0.0") & " mm" & vbCrLf
End Sub

' Arquivo do app: linha 1 = onde salvar o .cdr, linha 2 = arte da frente (pagina 1), linha 3 = arte do verso (pagina 2).
' Rodando a mao: pergunta a frente e o verso, e salva na pasta da frente.
Sub ArteDoClienteNoMolde()
    Dim l() As String
    Dim destino As String, frente As String, verso As String
    Dim pasta As String, nomeBase As String
    Dim doc As Document
    Dim pos As Long
    Dim doApp As Boolean
    Dim faceAtual As String

    resultado = ""
    faceAtual = "frente"

    If Dir(MOLDE) = "" Then
        MsgBox "Nao achei o molde em: " & MOLDE, vbExclamation, "Arte no molde"
        Exit Sub
    End If

    l = LerLinhasEApagar("mockup-arte.txt")
    destino = l(0)
    frente = l(1)
    verso = l(2)
    doApp = (destino <> "")

    If Not doApp Then
        frente = EscolherArte()
        If frente = "" Then Exit Sub
        verso = Replace(Trim(InputBox("Cole o caminho da arte do VERSO (ou deixe vazio para criar o verso depois):", "Arte no molde")), Chr(34), "")
        pos = InStrRev(frente, "\")
        pasta = Left(frente, pos)
        nomeBase = Mid(frente, pos + 1)
        pos = InStrRev(nomeBase, ".")
        If pos > 1 Then nomeBase = Left(nomeBase, pos - 1)
        destino = pasta & nomeBase & " - MOLDE.cdr"
    End If

    If frente <> "" Then
        If Dir(frente) = "" Then
            MsgBox "Nao achei o arquivo da frente: " & frente, vbExclamation, "Arte no molde"
            Exit Sub
        End If
    End If
    If verso <> "" Then
        If Dir(verso) = "" Then
            MsgBox "Nao achei o arquivo do verso: " & verso, vbExclamation, "Arte no molde"
            Exit Sub
        End If
    End If
    If frente = "" And verso = "" Then Exit Sub

    If Dir(destino) <> "" Then
        If Not doApp Then MsgBox "Ja existe: " & destino & vbCrLf & "Vou abrir o que ja existe, sem alterar.", vbInformation, "Arte no molde"
        OpenDocument destino
        resultado = "existente=1"
        If doApp Then GravarResultado
        Exit Sub
    End If

    On Error GoTo erro
    Set doc = OpenDocument(MOLDE)
    doc.SaveAs destino
    doc.Unit = cdrMillimeter
    faceAtual = "frente"
    If frente <> "" Then ColocarArte doc, 1, frente, "frente" Else resultado = resultado & "frente=SEM" & vbCrLf
    faceAtual = "verso"
    If verso <> "" Then ColocarArte doc, 2, verso, "verso" Else resultado = resultado & "verso=SEM" & vbCrLf
    doc.Pages(1).Activate
    doc.Save
    If doApp Then GravarResultado
    If Not doApp Then MsgBox "Pronto: " & destino, vbInformation, "Arte no molde"
    Exit Sub

erro:
    resultado = resultado & faceAtual & "=ERRO " & Replace(Err.Description, vbCrLf, " ") & vbCrLf
    If doApp Then GravarResultado
    MsgBox "Nao consegui: " & Err.Description, vbCritical, "Arte no molde"
End Sub

Sub ExportarPDFparaMKP()
    Dim doc As Document
    Dim pasta As String, nomeBase As String, destino As String, esperado As String
    Dim pos As Long
    Dim doApp As Boolean

    esperado = LerEApagar("mockup-pdf.txt")
    doApp = (esperado <> "")

    If Documents.Count = 0 Then
        MsgBox "Abra o arquivo .cdr do cliente antes.", vbExclamation, "Exportar PDF para o MKP"
        Exit Sub
    End If
    Set doc = ActiveDocument
    If Len(doc.FilePath) = 0 Or Len(doc.FileName) = 0 Then
        MsgBox "Salve o arquivo (Ctrl+S) antes de exportar.", vbExclamation, "Exportar PDF para o MKP"
        Exit Sub
    End If
    ' vindo do app: so exporta se o documento aberto for da pasta do cliente que voce escolheu la
    If doApp Then
        If SemBarraFinal(doc.FilePath) <> SemBarraFinal(esperado) Then
            MsgBox "O documento aberto no Corel (" & doc.FileName & ") nao e da pasta do cliente escolhida no app." & vbCrLf & "Deixe o .cdr certo como o documento ativo e tente de novo.", vbExclamation, "Exportar PDF para o MKP"
            Exit Sub
        End If
    End If

    pasta = doc.FilePath
    If Right(pasta, 1) <> "\" Then pasta = pasta & "\"
    pos = InStrRev(doc.FileName, ".")
    If pos > 1 Then
        nomeBase = Left(doc.FileName, pos - 1)
    Else
        nomeBase = doc.FileName
    End If
    destino = pasta & nomeBase & ".pdf"

    If Dir(destino) <> "" Then
        If MsgBox("Ja existe " & nomeBase & ".pdf nesta pasta. Substituir?", vbYesNo + vbQuestion, "Exportar PDF para o MKP") = vbNo Then Exit Sub
    End If

    On Error GoTo erroPreset
    doc.PDFSettings.Load "MKP"
    On Error GoTo erroExportar
    doc.PublishToPDF destino
    If Not doApp Then MsgBox "PDF criado: " & destino, vbInformation, "Exportar PDF para o MKP"
    Exit Sub

erroPreset:
    MsgBox "Nao achei a predefinicao de PDF chamada MKP. Crie ela primeiro (Arquivo > Publicar como PDF > Configuracoes).", vbExclamation, "Exportar PDF para o MKP"
    Exit Sub
erroExportar:
    MsgBox "Nao consegui exportar: " & Err.Description, vbCritical, "Exportar PDF para o MKP"
End Sub

' ============================================================================================
' ANUNCIO 2027
'  - AnuncioNoMolde: o app deixa a lista do anuncio em %TEMP%\mockup-anuncio.txt; o macro le, apaga e monta o .cdr.
'  - AnuncioDaPasta: plano B, sem o app. Pergunta a pasta do anuncio e le <pasta>\Corel\montar.txt (ou, se nao achar, <pasta>\_corel\montar.txt, das pastas antigas).
' Lista (manifesto), uma coisa por linha:
'   destino=<caminho do .cdr>
'   capas=<N>
'   frente=<arquivo>|pf=<pagina do PDF>|verso=<arquivo>|pv=<pagina do PDF>|ean=<13 digitos>|mod=<95 modulos 0/1>   (uma linha por capa)
' Capa i usa as paginas 2i-1 (capa, impar) e 2i (contra capa, par). Da 2a capa em diante as paginas sao copias das paginas 1 e 2 do molde.
' O codigo de barras e desenhado (vetor) dentro do retangulo do EAN da pagina par. O quadrado do molde (logo) nao e tocado.
' Resultado (so quando vem do app), em %TEMP%\mockup-resultado.txt: capa<N>=OK <ampliacao>% ou capa<N>=ERRO <motivo>.
' Um erro numa capa nunca impede as outras.
' As chamadas marcadas com "TESTAR NO COREL" sao de membros do Corel que nao deu para confirmar fora do Corel real;
' por isso elas passam por variaveis "As Object" (se o membro nao existir, da erro so naquela capa, e o modulo continua compilando).
' ============================================================================================

Sub AnuncioNoMolde()
    Dim manifesto As String
    manifesto = LerManifestoEApagar("mockup-anuncio.txt")
    If Trim(manifesto) = "" Then
        MsgBox "Nao achei a lista do anuncio que o app deixa para o Corel." & vbCrLf & _
            "Use o botao do app de novo, ou rode o macro AnuncioDaPasta e escolha a pasta do anuncio.", vbExclamation, "Anuncio no molde"
        Exit Sub
    End If
    MontarAnuncio manifesto, "", True
End Sub

Sub AnuncioDaPasta()
    Dim escolha As String, pasta As String, arquivo As String

    escolha = EscolherPastaDoAnuncio()
    If escolha = "" Then Exit Sub
    Do While Right(escolha, 1) = "\"
        escolha = Left(escolha, Len(escolha) - 1)
    Loop

    ' aceita: o montar.txt, a pasta Corel (ou _corel), a pasta do anuncio ou qualquer arquivo de dentro da pasta do anuncio
    If LCase(NomeDoArquivo(escolha)) = "montar.txt" Then
        arquivo = escolha
        pasta = PastaDe(PastaDe(escolha))
    ElseIf EhPasta(escolha) Then
        If LCase(NomeDoArquivo(escolha)) = "corel" Or LCase(NomeDoArquivo(escolha)) = "_corel" Then pasta = PastaDe(escolha) Else pasta = escolha
        arquivo = pasta & "\Corel\montar.txt"
        If Not Existe(arquivo) Then arquivo = pasta & "\_corel\montar.txt"
    Else
        pasta = PastaDe(escolha)
        arquivo = pasta & "\Corel\montar.txt"
        If Not Existe(arquivo) Then arquivo = pasta & "\_corel\montar.txt"
    End If

    If Not Existe(arquivo) Then
        MsgBox "Nao achei a lista do anuncio em:" & vbCrLf & arquivo & vbCrLf & vbCrLf & _
            "Escolha a pasta do anuncio (a que tem a pasta Corel dentro).", vbExclamation, "Anuncio da pasta"
        Exit Sub
    End If

    MontarAnuncio LerArquivoInteiro(arquivo), pasta, False
End Sub

Private Function EscolherPastaDoAnuncio() As String
    Dim r As String
    On Error Resume Next
    ' TESTAR NO COREL: filtro do GetFileBox so com o nome montar.txt
    r = Application.GetFileBox("Lista do anuncio (montar.txt)|montar.txt|Texto|*.txt", "Escolha o montar.txt (dentro da pasta Corel do anuncio)", 0)
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        r = InputBox("Cole o caminho completo da pasta do anuncio (a que tem a pasta Corel dentro):", "Anuncio da pasta")
    End If
    EscolherPastaDoAnuncio = Trim(Replace(r, Chr(34), ""))
End Function

' Le o arquivo inteiro como o app grava (pagina de codigo do Windows) e devolve o texto.
Private Function LerArquivoInteiro(caminho As String) As String
    Dim n As Integer, texto As String
    n = FreeFile
    Open caminho For Binary Access Read As #n
    texto = Space$(LOF(n))
    If LOF(n) > 0 Then Get #n, , texto
    Close #n
    LerArquivoInteiro = texto
End Function

' Le TODAS as linhas do arquivo do app na pasta temporaria e apaga o arquivo. Arquivo velho (mais de 10 minutos) e ignorado.
Private Function LerManifestoEApagar(nome As String) As String
    Dim caminho As String
    On Error Resume Next
    LerManifestoEApagar = ""
    caminho = Environ("TEMP") & "\" & nome
    If Dir(caminho) = "" Then Exit Function
    If DateDiff("n", FileDateTime(caminho), Now) > IDADE_MAXIMA_MIN Then
        Kill caminho
        Exit Function
    End If
    LerManifestoEApagar = LerArquivoInteiro(caminho)
    Kill caminho
End Function

Private Function Existe(caminho As String) As Boolean
    On Error Resume Next
    Existe = False
    If caminho = "" Then Exit Function
    Existe = (Dir(caminho) <> "")
End Function

Private Function EhPasta(caminho As String) As Boolean
    On Error Resume Next
    EhPasta = False
    EhPasta = ((GetAttr(caminho) And vbDirectory) = vbDirectory)
End Function

Private Function NomeDoArquivo(caminho As String) As String
    NomeDoArquivo = Mid(caminho, InStrRev(caminho, "\") + 1)
End Function

Private Function PastaDe(caminho As String) As String
    Dim pos As Long
    pos = InStrRev(caminho, "\")
    If pos > 0 Then PastaDe = Left(caminho, pos - 1) Else PastaDe = ""
End Function

' Plano B: se a pasta do anuncio mudou de lugar (outro PC, outra letra do Drive), procura o arquivo pelo nome dentro da pasta escolhida.
Private Function NaPastaDoAnuncio(caminho As String, pastaDoAnuncio As String) As String
    NaPastaDoAnuncio = caminho
    If caminho = "" Or pastaDoAnuncio = "" Then Exit Function
    If Existe(caminho) Then Exit Function
    If Existe(pastaDoAnuncio & "\" & NomeDoArquivo(caminho)) Then NaPastaDoAnuncio = pastaDoAnuncio & "\" & NomeDoArquivo(caminho)
End Function

' Motivo do erro so com letras sem acento (o app le o resultado como texto simples).
Private Function SoAscii(ByVal s As String) As String
    Dim i As Long, c As Long, r As String
    s = Replace(Replace(s, vbCr, " "), vbLf, " ")
    For i = 1 To Len(s)
        c = AscW(Mid$(s, i, 1))
        Select Case c
            Case 32 To 126: r = r & ChrW(c)
            Case 192 To 197: r = r & "A"
            Case 199: r = r & "C"
            Case 200 To 203: r = r & "E"
            Case 204 To 207: r = r & "I"
            Case 209: r = r & "N"
            Case 210 To 214: r = r & "O"
            Case 217 To 220: r = r & "U"
            Case 224 To 229: r = r & "a"
            Case 231: r = r & "c"
            Case 232 To 235: r = r & "e"
            Case 236 To 239: r = r & "i"
            Case 241: r = r & "n"
            Case 242 To 246: r = r & "o"
            Case 249 To 252: r = r & "u"
            Case Else: r = r & "?"
        End Select
    Next
    SoAscii = Trim(r)
End Function

' Valor de um campo da linha da capa ("frente=...|pf=...|..."); vazio se nao houver.
Private Function CampoDoManifesto(linha As String, nome As String) As String
    Dim partes() As String, i As Long, pos As Long
    CampoDoManifesto = ""
    partes = Split(linha, "|")
    For i = LBound(partes) To UBound(partes)
        pos = InStr(partes(i), "=")
        If pos > 1 Then
            If LCase(Trim(Left(partes(i), pos - 1))) = LCase(nome) Then
                CampoDoManifesto = Trim(Mid(partes(i), pos + 1))
                Exit Function
            End If
        End If
    Next
End Function

' Le uma propriedade Verdadeiro/Falso pelo nome; se o Corel nao tiver essa propriedade, devolve o padrao.
Private Function PropriedadeBooleana(ByVal o As Object, nome As String, padrao As Boolean) As Boolean
    On Error Resume Next
    PropriedadeBooleana = padrao
    PropriedadeBooleana = CBool(CallByName(o, nome, VbGet))
End Function

Private Function CamadaEspecial(camada As Layer) As Boolean
    ' TESTAR NO COREL: Layer.IsSpecialLayer (guias, grade, area de trabalho)
    CamadaEspecial = PropriedadeBooleana(camada, "IsSpecialLayer", False)
End Function

Private Function CamadaMestre(camada As Layer) As Boolean
    ' TESTAR NO COREL: Layer.Master (camadas da pagina mestre aparecem em todas as paginas)
    CamadaMestre = PropriedadeBooleana(camada, "Master", False)
End Function

' Todas as camadas da pagina, com as da pagina mestre se o Corel der (para achar o retangulo mesmo se ele estiver numa camada mestre).
Private Function CamadasParaProcurar(pagina As Page) As Object
    Dim o As Object
    Set o = pagina
    On Error Resume Next
    ' TESTAR NO COREL: Page.AllLayers
    Set CamadasParaProcurar = o.AllLayers
    If Err.Number <> 0 Or CamadasParaProcurar Is Nothing Then
        Err.Clear
        Set CamadasParaProcurar = pagina.Layers
    End If
End Function

' Monta o .cdr do anuncio a partir do manifesto. pastaDoAnuncio so vem no plano B; doApp = grava o resultado para o app.
Private Sub MontarAnuncio(manifesto As String, Optional pastaDoAnuncio As String = "", Optional doApp As Boolean = False)
    Dim linhas() As String, linha As String, texto As String
    Dim capas() As String, n As Long, i As Long
    Dim destino As String, motivo As String
    Dim doc As Document
    Dim frentes() As Page, versos() As Page, falhaPagina() As String
    Dim pdfs As New Collection
    Dim titulo As String

    resultado = ""
    If doApp Then titulo = "Anuncio no molde" Else titulo = "Anuncio da pasta"

    texto = Replace(Replace(manifesto, vbCrLf, vbLf), vbCr, vbLf)
    linhas = Split(texto, vbLf)
    n = 0
    For i = LBound(linhas) To UBound(linhas)
        linha = Trim(linhas(i))
        If LCase(Left(linha, 8)) = "destino=" Then
            destino = Trim(Mid(linha, 9))
        ElseIf LCase(Left(linha, 7)) = "frente=" Or InStr(linha, "|") > 0 Then
            n = n + 1
            ReDim Preserve capas(1 To n)
            capas(n) = linha
        End If
    Next
    If pastaDoAnuncio <> "" And destino <> "" Then
        If Not EhPasta(PastaDe(destino)) Then destino = pastaDoAnuncio & "\" & NomeDoArquivo(destino)
    End If

    If destino = "" Or n = 0 Then
        MsgBox "A lista do anuncio esta vazia ou incompleta (sem destino ou sem capas).", vbExclamation, titulo
        Exit Sub
    End If

    If Dir(MOLDE) = "" Then
        motivo = "nao achei o molde em " & MOLDE
        GoTo falhaGeral
    End If

    If Existe(destino) Then
        If Not doApp Then MsgBox "Ja existe: " & destino & vbCrLf & "Vou abrir o que ja existe, sem alterar." & vbCrLf & _
            "Para montar de novo, apague ou renomeie esse .cdr e rode o macro outra vez.", vbInformation, titulo
        OpenDocument destino
        resultado = "existente=1"
        If doApp Then GravarResultado
        Exit Sub
    End If

    ' abre uma COPIA do molde (salva com outro nome antes de mexer)
    On Error GoTo erroAoAbrir
    Set doc = OpenDocument(MOLDE)
    doc.SaveAs destino
    doc.Unit = cdrMillimeter
    If doc.Pages.Count < 2 Then
        motivo = "o molde precisa ter 2 paginas (capa e contra capa)"
        GoTo falhaGeral
    End If
    On Error GoTo 0

    ' 1) todas as paginas antes de qualquer arte: as copias saem das paginas 1 e 2 ainda limpas
    ReDim frentes(1 To n)
    ReDim versos(1 To n)
    ReDim falhaPagina(1 To n)
    Set frentes(1) = doc.Pages(1)
    Set versos(1) = doc.Pages(2)
    For i = 2 To n
        falhaPagina(i) = CriarParDePaginas(doc, frentes(i), versos(i))
    Next

    ' 2) cada capa sozinha: erro numa nao para as outras
    For i = 1 To n
        resultado = resultado & "capa" & i & "=" & MontarCapa(doc, capas(i), frentes(i), versos(i), falhaPagina(i), pastaDoAnuncio, pdfs) & vbCrLf
    Next

    FecharPdfs pdfs
    On Error Resume Next
    doc.Activate
    doc.Pages(1).Activate
    Err.Clear
    doc.Save
    If Err.Number <> 0 Then
        motivo = SoAscii(Err.Description)
        Err.Clear
        On Error GoTo 0
        MsgBox "Montei o anuncio, mas nao consegui salvar o .cdr: " & motivo & vbCrLf & "Salve pelo menu Arquivo > Salvar.", vbExclamation, titulo
    End If
    On Error GoTo 0

    If doApp Then
        GravarResultado
    Else
        MsgBox "Pronto: " & destino & vbCrLf & vbCrLf & resultado, vbInformation, titulo
    End If
    Exit Sub

erroAoAbrir:
    motivo = "nao consegui abrir o molde ou salvar o .cdr: " & SoAscii(Err.Description)
    Resume falhaGeral
falhaGeral:
    On Error Resume Next
    FecharPdfs pdfs
    On Error GoTo 0
    resultado = ""
    For i = 1 To n
        resultado = resultado & "capa" & i & "=ERRO " & SoAscii(motivo) & vbCrLf
    Next
    If doApp Then GravarResultado
    MsgBox "Nao consegui montar o anuncio: " & motivo, vbCritical, titulo
End Sub

' Cria o par de paginas de mais uma capa (copias das paginas 1 e 2 do molde). Devolve "" ou o motivo da falha.
Private Function CriarParDePaginas(doc As Document, ByRef pagFrente As Page, ByRef pagVerso As Page) As String
    On Error GoTo erro
    Set pagFrente = NovaPaginaComoModelo(doc, doc.Pages(1))
    Set pagVerso = NovaPaginaComoModelo(doc, doc.Pages(2))
    CriarParDePaginas = ""
    Exit Function
erro:
    CriarParDePaginas = "nao consegui criar as paginas desta capa: " & SoAscii(Err.Description)
End Function

' Pagina nova no fim do documento, do mesmo tamanho do modelo, com copia das formas de cada camada (mesma ordem de empilhamento).
Private Function NovaPaginaComoModelo(doc As Document, modelo As Page) As Page
    Dim nova As Page, camada As Layer, destino As Layer, k As Long
    Dim o As Object, forma As Object

    doc.AddPages 1
    Set nova = doc.Pages(doc.Pages.Count)

    On Error Resume Next
    ' TESTAR NO COREL: Page.SetSize (as paginas novas nascem com o tamanho padrao do documento)
    Set o = nova
    o.SetSize modelo.SizeWidth, modelo.SizeHeight
    Err.Clear
    On Error GoTo 0

    For Each camada In modelo.Layers
        If Not CamadaEspecial(camada) And Not CamadaMestre(camada) Then
            Set destino = CamadaDaPagina(nova, camada.Name)
            ' de baixo para cima: cada copia entra no topo, entao a ordem fica igual a do molde
            For k = camada.Shapes.Count To 1 Step -1
                ' TESTAR NO COREL: Shape.CopyToLayer (copia a forma, mesma posicao, para a camada da pagina nova)
                Set forma = camada.Shapes(k)
                forma.CopyToLayer destino
            Next
            On Error Resume Next
            destino.Visible = camada.Visible
            destino.Printable = camada.Printable
            destino.Editable = camada.Editable
            Err.Clear
            On Error GoTo 0
        End If
    Next
    Set NovaPaginaComoModelo = nova
End Function

Private Function CamadaDaPagina(pagina As Page, nome As String) As Layer
    Dim camada As Layer
    For Each camada In pagina.Layers
        If camada.Name = nome And Not CamadaEspecial(camada) And Not CamadaMestre(camada) Then
            Set CamadaDaPagina = camada
            Exit Function
        End If
    Next
    Set CamadaDaPagina = pagina.CreateLayer(nome)
End Function

' Uma capa: arte da frente na pagina impar, arte do verso e codigo de barras na pagina par. Devolve "OK 97%", "OK" ou "ERRO motivo".
Private Function MontarCapa(doc As Document, linha As String, pagFrente As Page, pagVerso As Page, falhaDaPagina As String, _
                            pastaDoAnuncio As String, pdfs As Collection) As String
    Dim frente As String, verso As String, ean As String, modulos As String
    Dim pf As Long, pv As Long, i As Long
    Dim retangulo As Shape, ampliacao As Double, etapa As String

    If falhaDaPagina <> "" Then
        MontarCapa = "ERRO " & SoAscii(falhaDaPagina)
        Exit Function
    End If

    On Error GoTo erro
    etapa = "lendo a lista"
    frente = NaPastaDoAnuncio(CampoDoManifesto(linha, "frente"), pastaDoAnuncio)
    verso = NaPastaDoAnuncio(CampoDoManifesto(linha, "verso"), pastaDoAnuncio)
    pf = CLng(Val(CampoDoManifesto(linha, "pf")))
    pv = CLng(Val(CampoDoManifesto(linha, "pv")))
    ean = CampoDoManifesto(linha, "ean")
    modulos = CampoDoManifesto(linha, "mod")

    If frente <> "" And Not Existe(frente) Then
        MontarCapa = "ERRO nao achei a arte da capa: " & SoAscii(NomeDoArquivo(frente))
        Exit Function
    End If
    If verso <> "" And Not Existe(verso) Then
        MontarCapa = "ERRO nao achei a arte da contra capa: " & SoAscii(NomeDoArquivo(verso))
        Exit Function
    End If
    If ean <> "" Then
        If Len(ean) <> 13 Or Len(modulos) <> 95 Then
            MontarCapa = "ERRO codigo de barras invalido na lista"
            Exit Function
        End If
        For i = 1 To 95
            If Mid$(modulos, i, 1) <> "0" And Mid$(modulos, i, 1) <> "1" Then
                MontarCapa = "ERRO codigo de barras invalido na lista"
                Exit Function
            End If
        Next
        For i = 1 To 13
            If Mid$(ean, i, 1) < "0" Or Mid$(ean, i, 1) > "9" Then
                MontarCapa = "ERRO codigo de barras invalido na lista"
                Exit Function
            End If
        Next
        ' procura o retangulo ANTES de colocar a arte do verso (a arte pode ter retangulos dentro)
        etapa = "procurando o retangulo do EAN"
        Set retangulo = AcharRetanguloDoEan(pagVerso)
    End If

    etapa = "colocando a arte da capa"
    If frente <> "" Then ColocarArteNaPagina doc, pagFrente, frente, pf, pdfs
    etapa = "colocando a arte da contra capa"
    If verso <> "" Then ColocarArteNaPagina doc, pagVerso, verso, pv, pdfs

    If ean = "" Then
        MontarCapa = "OK"
        Exit Function
    End If
    If retangulo Is Nothing Then
        MontarCapa = "ERRO sem retangulo"
        Exit Function
    End If

    etapa = "desenhando o codigo de barras"
    ampliacao = DesenharEan(pagVerso, retangulo, modulos, ean)
    MontarCapa = "OK " & CStr(CLng(ampliacao * 100)) & "%"
    Exit Function

erro:
    MontarCapa = "ERRO " & etapa & ": " & SoAscii(Err.Description)
End Function

' Coloca a arte na pagina (mesma regra do ColocarArte: cabe no quadrado de 150 x 210, sem distorcer, centralizada, atras do molde).
' paginaPdf > 0 num PDF: so aquela pagina do PDF. Senao: importa o arquivo inteiro.
Private Sub ColocarArteNaPagina(doc As Document, pagina As Page, arquivo As String, paginaPdf As Long, pdfs As Collection)
    Dim sr As ShapeRange, s As Shape, f As Double, f2 As Double

    doc.Activate
    pagina.Activate
    If paginaPdf > 0 And LCase(Right(arquivo, 4)) = ".pdf" Then
        Set sr = CopiarPaginaDoPdf(doc, pagina, arquivo, paginaPdf, pdfs)
    Else
        ' TESTAR NO COREL: PDF de varias paginas importado inteiro pode abrir a janela de escolher a pagina
        pagina.ActiveLayer.Import arquivo
        Set sr = ActiveSelectionRange
    End If
    If sr Is Nothing Then Err.Raise vbObjectError + 11, , "a importacao nao trouxe nada"
    If sr.Count = 0 Then Err.Raise vbObjectError + 11, , "a importacao nao trouxe nada"
    If sr.Count > 1 Then Set s = sr.Group Else Set s = sr.Item(1)

    f = LARGURA / s.SizeWidth
    f2 = ALTURA / s.SizeHeight
    If f2 < f Then f = f2
    s.SetSize s.SizeWidth * f, s.SizeHeight * f
    s.CenterX = CENTRO_X
    s.CenterY = CENTRO_Y
    s.OrderToBack
End Sub

' O PDF aberto no Corel (abre uma vez so por arquivo, mesmo com varias capas).
Private Function PdfAberto(arquivo As String, pdfs As Collection) As Document
    Dim d As Document
    On Error Resume Next
    Set d = pdfs(LCase(arquivo))
    Err.Clear
    On Error GoTo 0
    If d Is Nothing Then
        ' TESTAR NO COREL: abrir PDF pelo macro pode mostrar a janela "Importar PDF" (texto como texto/curvas): clicar OK
        Set d = OpenDocument(arquivo)
        pdfs.Add d, LCase(arquivo)
    End If
    Set PdfAberto = d
End Function

' Copia as formas de uma pagina do PDF (aberto como documento) para a pagina do anuncio. Devolve as formas copiadas.
Private Function CopiarPaginaDoPdf(doc As Document, pagina As Page, arquivo As String, paginaPdf As Long, pdfs As Collection) As ShapeRange
    Dim pdf As Document, camada As Layer, destino As Layer, k As Long
    Dim copia As New ShapeRange, forma As Object, todas As Object, alvo As Object

    Set pdf = PdfAberto(arquivo, pdfs)
    If pdf.Pages.Count < paginaPdf Then
        Err.Raise vbObjectError + 12, , "o PDF tem " & pdf.Pages.Count & " pagina(s), nao tem a pagina " & paginaPdf
    End If
    Set destino = pagina.ActiveLayer

    ' 1a tentativa: CopyToLayer, forma por forma, de baixo para cima (mantem a ordem)
    On Error GoTo tentarAreaDeTransferencia
    For Each camada In pdf.Pages(paginaPdf).Layers
        If Not CamadaEspecial(camada) Then
            For k = camada.Shapes.Count To 1 Step -1
                ' TESTAR NO COREL: Shape.CopyToLayer entre dois documentos
                Set forma = camada.Shapes(k)
                copia.Add forma.CopyToLayer(destino)
            Next
        End If
    Next
    On Error GoTo 0
    If copia.Count = 0 Then Err.Raise vbObjectError + 13, , "a pagina " & paginaPdf & " do PDF esta vazia"
    Set CopiarPaginaDoPdf = copia
    Exit Function

tentarAreaDeTransferencia:
    Resume viaAreaDeTransferencia
viaAreaDeTransferencia:
    ' 2a tentativa: copiar e colar (apaga antes o que a 1a tentativa chegou a copiar)
    On Error Resume Next
    If copia.Count > 0 Then copia.Delete
    Err.Clear
    On Error GoTo 0
    ' TESTAR NO COREL: Shapes.All, ShapeRange.Copy e Layer.Paste (colar no mesmo lugar)
    Set todas = pdf.Pages(paginaPdf).Shapes.All
    If todas.Count = 0 Then Err.Raise vbObjectError + 13, , "a pagina " & paginaPdf & " do PDF esta vazia"
    todas.Copy
    doc.Activate
    pagina.Activate
    Set alvo = destino
    alvo.Paste
    Set CopiarPaginaDoPdf = ActiveSelectionRange
End Function

Private Sub FecharPdfs(pdfs As Collection)
    Dim d As Object
    On Error Resume Next
    For Each d In pdfs
        ' TESTAR NO COREL: Document.Dirty = False para fechar o PDF sem perguntar se salva
        d.Dirty = False
        d.Close
        Err.Clear
    Next
    Set pdfs = New Collection
End Sub

' O retangulo onde vai o codigo de barras, na contra capa:
'  1) a forma com o nome EAN (de qualquer tipo), se existir;
'  2) senao, o retangulo mais largo que alto, na metade de baixo e no centro da pagina (o quadrado do logo e ignorado).
' Devolve Nothing se nao achar.
Private Function AcharRetanguloDoEan(pagina As Page) As Shape
    Dim camada As Layer, s As Shape, melhor As Shape
    Dim esquerda As Double, direita As Double, baixo As Double, alto As Double

    For Each camada In CamadasParaProcurar(pagina)
        If Not CamadaEspecial(camada) Then
            Set s = ProcurarPorNome(camada.Shapes, "EAN")
            If Not s Is Nothing Then
                Set AcharRetanguloDoEan = s
                Exit Function
            End If
        End If
    Next

    LimitesDaPagina pagina, esquerda, direita, baixo, alto
    For Each camada In CamadasParaProcurar(pagina)
        If Not CamadaEspecial(camada) Then ProcurarRetangulo camada.Shapes, esquerda, direita, baixo, alto, melhor
    Next
    Set AcharRetanguloDoEan = melhor
End Function

Private Function ProcurarPorNome(formas As Shapes, nome As String) As Shape
    Dim s As Shape, achado As Shape
    For Each s In formas
        If UCase(Trim(s.Name)) = UCase(nome) Then
            Set ProcurarPorNome = s
            Exit Function
        End If
        If s.Type = cdrGroupShape Then
            Set achado = ProcurarPorNome(s.Shapes, nome)
            If Not achado Is Nothing Then
                Set ProcurarPorNome = achado
                Exit Function
            End If
        End If
    Next
End Function

Private Sub ProcurarRetangulo(formas As Shapes, esquerda As Double, direita As Double, baixo As Double, alto As Double, ByRef melhor As Shape)
    Dim s As Shape, w As Double, h As Double, larguraPag As Double, alturaPag As Double
    larguraPag = direita - esquerda
    alturaPag = alto - baixo
    For Each s In formas
        If s.Type = cdrGroupShape Then
            ProcurarRetangulo s.Shapes, esquerda, direita, baixo, alto, melhor
        ElseIf s.Type = cdrRectangleShape Then
            w = s.SizeWidth
            h = s.SizeHeight
            ' mais largo que alto (o quadrado do logo fica de fora), menor que meia pagina de altura e que 80% da largura,
            ' com o centro na metade de baixo e perto do meio da pagina
            If h > 0 And w > h * 1.2 And h < alturaPag / 2 And w < larguraPag * 0.8 Then
                If s.CenterY < baixo + alturaPag / 2 And Abs(s.CenterX - (esquerda + larguraPag / 2)) < larguraPag * 0.25 Then
                    If melhor Is Nothing Then
                        Set melhor = s
                    ElseIf w > melhor.SizeWidth Then
                        Set melhor = s
                    End If
                End If
            End If
        End If
    Next
End Sub

' Bordas da pagina nas coordenadas do Corel (y cresce para cima). Sem as propriedades da pagina, supoe origem no canto de baixo.
Private Sub LimitesDaPagina(pagina As Page, ByRef esquerda As Double, ByRef direita As Double, ByRef baixo As Double, ByRef alto As Double)
    Dim o As Object, a As Double, b As Double, c As Double, d As Double
    esquerda = 0
    baixo = 0
    direita = pagina.SizeWidth
    alto = pagina.SizeHeight
    On Error Resume Next
    ' TESTAR NO COREL: Page.LeftX / RightX / BottomY / TopY
    Set o = pagina
    a = o.LeftX
    b = o.RightX
    c = o.BottomY
    d = o.TopY
    If Err.Number = 0 And b > a And d > c Then
        esquerda = a
        direita = b
        baixo = c
        alto = d
    End If
    Err.Clear
End Sub

' Modulos de guarda (0 a 94): inicio, meio e fim, que descem mais.
Private Function EhGuarda(m As Long) As Boolean
    EhGuarda = (m < 3) Or (m >= 45 And m < 50) Or (m >= 92)
End Function

Private Sub PintarDePreto(s As Shape)
    s.Fill.ApplyUniformFill CreateCMYKColor(0, 0, 0, 100)
    s.Outline.SetNoOutline
End Sub

' Camada onde o codigo de barras e desenhado: a do retangulo (se der para editar e nao for da pagina mestre), senao a ativa da pagina.
Private Function CamadaParaDesenhar(pagina As Page, retangulo As Shape) As Layer
    Dim camada As Layer
    On Error Resume Next
    Set camada = retangulo.Layer
    On Error GoTo 0
    If Not camada Is Nothing Then
        If camada.Editable And Not CamadaMestre(camada) And Not CamadaEspecial(camada) Then
            Set CamadaParaDesenhar = camada
            Exit Function
        End If
    End If
    Set camada = pagina.ActiveLayer
    If Not camada.Editable Then Err.Raise vbObjectError + 14, , "a camada da contra capa esta travada"
    Set CamadaParaDesenhar = camada
End Function

' Um digito em Arial, centralizado em cx (mm), pousado na linha de base y=158 do desenho.
Private Function CriarDigito(camada As Layer, digito As String, cx As Double, y0 As Double, k As Double) As Shape
    Dim s As Shape, pontos As Double
    pontos = EAN_TAMANHO_DIGITOS * k / 25.4 * 72
    ' TESTAR NO COREL: CreateArtisticText com fonte e tamanho (em pontos)
    Set s = camada.CreateArtisticText(cx, y0 + (EAN_ALTURA - EAN_Y_DIGITOS) * k, digito, , , "Arial", pontos)
    s.Fill.ApplyUniformFill CreateCMYKColor(0, 0, 0, 100)
    s.CenterX = cx
    s.CenterY = y0 + (EAN_ALTURA - EAN_Y_DIGITOS + EAN_TAMANHO_DIGITOS * EAN_ALTURA_ALGARISMO / 2) * k
    Set CriarDigito = s
End Function

' Desenha o EAN-13 (barras pretas a partir dos 95 modulos e os digitos) dentro do retangulo, sem distorcer, centralizado e agrupado.
' Desenho de 543 x 189 (o mesmo do app): barras em y=18, altura 92 (guardas 104), modulo 4,35, digitos em y=158 tamanho 24.
' Devolve a ampliacao (1 = 100%): larguraMm / 543 * 4,35 / 0,33.
Private Function DesenharEan(pagina As Page, retangulo As Shape, modulos As String, ean As String) As Double
    Dim k As Double, x0 As Double, y0 As Double, xm As Double, larguraMm As Double
    Dim camada As Layer, formas As New ShapeRange, s As Shape, grupo As Shape
    Dim i As Long, inicio As Long, j As Long, h As Double, cx As Double

    ' escala uniforme: o desenho inteiro cabe no retangulo
    k = retangulo.SizeWidth / EAN_LARGURA
    If retangulo.SizeHeight / EAN_ALTURA < k Then k = retangulo.SizeHeight / EAN_ALTURA
    If k <= 0 Then Err.Raise vbObjectError + 15, , "o retangulo do EAN nao tem tamanho"
    larguraMm = EAN_LARGURA * k
    ' canto de baixo, a esquerda, do desenho (em mm); y do Corel cresce para cima, o do desenho para baixo
    x0 = retangulo.CenterX - larguraMm / 2
    y0 = retangulo.CenterY - EAN_ALTURA * k / 2
    ' onde comecam as barras, em unidades do desenho
    xm = (EAN_LARGURA - 95 * EAN_MODULO) / 2

    Set camada = CamadaParaDesenhar(pagina, retangulo)

    ' barras: cada sequencia de "1" vira um retangulo so
    i = 1
    Do While i <= 95
        If Mid$(modulos, i, 1) = "1" Then
            inicio = i
            Do While i < 95
                If Mid$(modulos, i + 1, 1) <> "1" Then Exit Do
                i = i + 1
            Loop
            If EhGuarda(inicio - 1) Then h = EAN_ALTURA_GUARDA Else h = EAN_ALTURA_NORMAL
            Set s = camada.CreateRectangle2(x0 + (xm + (inicio - 1) * EAN_MODULO) * k, _
                                            y0 + (EAN_ALTURA - EAN_BARRA_Y - h) * k, _
                                            (i - inicio + 1) * EAN_MODULO * k, h * k)
            PintarDePreto s
            formas.Add s
        End If
        i = i + 1
    Loop

    ' digitos: o 1o a esquerda das barras; depois 6 embaixo da metade esquerda e 6 embaixo da direita, cada um sob os seus 7 modulos
    formas.Add CriarDigito(camada, Mid$(ean, 1, 1), x0 + EAN_X_PRIMEIRO_DIGITO * k, y0, k)
    For j = 1 To 6
        cx = xm + (3 + 7 * (j - 1) + 3.5) * EAN_MODULO
        formas.Add CriarDigito(camada, Mid$(ean, 1 + j, 1), x0 + cx * k, y0, k)
        cx = xm + (50 + 7 * (j - 1) + 3.5) * EAN_MODULO
        formas.Add CriarDigito(camada, Mid$(ean, 7 + j, 1), x0 + cx * k, y0, k)
    Next

    Set grupo = formas.Group
    ' criado depois do retangulo, o grupo ja fica na frente dele quando estao na mesma camada
    grupo.Name = "Codigo de barras " & ean

    DesenharEan = larguraMm / EAN_LARGURA * EAN_MODULO / EAN_MODULO_MM_100
End Function
