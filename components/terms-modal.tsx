import React from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    Platform,
    SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TermsModalProps {
    visible: boolean;
    onClose: () => void;
}

export function TermsModal({ visible, onClose }: TermsModalProps) {
    const insets = useSafeAreaInsets();
    // Garante que o botão fique visível e confortável, acima da barra de navegação de 3 botões do Android e da barra de gestos do iOS
    const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 20) + 16;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <Pressable style={styles.backdropPressable} onPress={onClose} />
                <View style={styles.modalContainer}>
                    {/* Top Grab Handle */}
                    <View style={styles.grabHandleContainer}>
                        <View style={styles.grabHandle} />
                    </View>

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerTitleContainer}>
                            <View style={styles.headerIconWrapper}>
                                <Ionicons name="document-text" size={20} color="#1c2d4f" />
                            </View>
                            <View>
                                <Text style={styles.headerTitle}>Termos e Condições de Uso</Text>
                                <Text style={styles.headerSubtitle}>Ambiente Virtual de Prestação de Serviços DUNO</Text>
                            </View>
                        </View>
                        <Pressable 
                            style={styles.closeIconButton} 
                            onPress={onClose}
                            hitSlop={12}
                        >
                            <Ionicons name="close" size={22} color="#64748b" />
                        </Pressable>
                    </View>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Scrollable Terms Content */}
                    <ScrollView 
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={true}
                        bounces={true}
                    >
                        <View style={styles.welcomeBanner}>
                            <Text style={styles.welcomeTitle}>BEM VINDO(A)!</Text>
                            <Text style={styles.welcomeSubtitle}>
                                Seja bem-vindo(a) à DUNO! Nosso propósito é melhorar a prestação de serviços em campo.
                            </Text>
                        </View>

                        <Text style={styles.paragraph}>
                            Este documento tem por objetivo regular e estabelecer os direitos, obrigações e as condições gerais de uso (“Termos e Condições de Uso”), do Ambiente Virtual de Prestação de Serviços DUNO (“PLATAFORMA”), disponível em <Text style={styles.linkText}>www.dunoup.com.br</Text>, celebrado entre a DUNO e VOCÊ, na qualidade de “Usuário”, “Cliente”, “Prestador de Serviço” ou “Visitante”, nos termos a seguir:
                        </Text>

                        {/* 1. DEFINIÇÕES */}
                        <Text style={styles.sectionTitle}>1. DEFINIÇÕES</Text>
                        <Text style={styles.paragraph}>
                            1.1. Com a finalidade de facilitar a compreensão destes Termos e Condições de Uso editados pela “DUNO”, descrevemos os seguintes termos:
                        </Text>
                        <View style={styles.definitionBox}>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“BANCO DE DADOS”: </Text>conjunto estruturado de INFORMAÇÕES, estabelecido em um ou em vários locais, em suporte eletrônico ou físico;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“INFORMAÇÃO”: </Text>quaisquer dados ou documentos de natureza técnica, operacional, comercial, jurídica, know-how, planos de negócios, métodos de contabilidade, técnicas e experiências acumuladas, contratos, papéis, estudos, pareceres, pesquisas, processos, negociações, metas e estatísticas, participação de mercado, vistorias, relatórios, métodos de precificação, logs;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“LICENCIADO”: </Text>pessoa física ou jurídica, com plena capacidade de contratar, que acessa o “SOFTWARE” da “DUNO” por meio do site, realizando seu cadastro e usufruindo das funcionalidades oferecidas;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“PLATAFORMA”: </Text>site, aplicativo e ambiente virtual de prestação de serviços, provido pela “DUNO”, os quais poderão ser acessados mediante login e senha no sistema disponibilizado em www.dunoup.com.br;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“POLÍTICA DE PRIVACIDADE”: </Text>regras estabelecidas pela “DUNO” destinadas à proteção da privacidade do Usuário e à transparência a respeito do tratamento das informações e dos dados pessoais disponibilizados na Plataforma;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“PRESTADORES DE SERVIÇOS”: </Text>profissionais contratados pelo “LICENCIADO” para prestar serviços externos;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“SOFTWARE”: </Text>software de propriedade exclusiva da “DUNO”, cujas funcionalidades e serviços estão disponibilizados no site, por meio do qual as INFORMAÇÕES do LICENCIADO serão fornecidas diretamente por ele ou coletadas dos smartphones de maneira automatizada;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“TERMOS DE USO”: </Text>regras estabelecidas neste instrumento, as quais regulamentam os termos e as condições para utilização da Plataforma;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“USUÁRIO”: </Text>pessoa física ou a pessoa jurídica (por seu representante legal), que se cadastra na Plataforma e a utiliza, mediante um login e uma senha;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“VISITANTE”: </Text>pessoa física que apenas acessa o site www.dunoup.com.br e realiza consultas, sem se cadastrar;
                            </Text>
                            <Text style={styles.bulletItem}>
                                <Text style={styles.bold}>“VOCÊ”: </Text>pessoa física ou a pessoa jurídica, por seu representante legal, que realiza o acesso à Plataforma, se cadastra e/ou dela faz uso de modo geral, na condição de “Usuário” “Prestador de Serviços” e/ou de “Visitante”.
                            </Text>
                        </View>

                        {/* 2. OBJETO */}
                        <Text style={styles.sectionTitle}>2. OBJETO</Text>
                        <Text style={styles.paragraph}>
                            2.1. Os presentes “Termos e Condições de Uso” têm por finalidade disciplinar a utilização da Plataforma por Você, de acordo com o estabelecido nos itens abaixo.
                        </Text>

                        {/* 3. ACEITAÇÃO */}
                        <Text style={styles.sectionTitle}>3. ACEITAÇÃO</Text>
                        <Text style={styles.paragraph}>
                            3.1. A aceitação dos presentes Termos e Condições de Uso, em relação ao Usuário se dará no ato em que clicar no botão “Eu li e concordo com os Termos e Condições de Uso”, quando de seu cadastro na Plataforma; já em relação ao Visitante, a aceitação ocorrerá quando ele navegar e utilizar a Plataforma.
                        </Text>
                        <Text style={styles.paragraph}>
                            3.2. Caso Você não esteja de acordo com estes Termos e Condições de Uso, recomendamos que não realize o seu cadastramento na Plataforma, abstendo-se de acessá-la e de utilizá-la.
                        </Text>
                        <Text style={styles.paragraph}>
                            3.3. Para fins de cadastro, acesso, navegação e/ou utilização da Plataforma serão aplicáveis as disposições contidas na Política de Privacidade e nas regras constantes nos presentes Termos de Uso.
                        </Text>
                        <Text style={styles.paragraph}>
                            3.4. Ao se cadastrar na Plataforma e acessá-la, Você declara ter no mínimo dezoito anos de idade e, ainda, atesta ser pessoa civilmente capaz para entender, aceitar e cumprir as disposições constantes destes Termos e Condições de Uso, da Política de Privacidade e do Contrato.
                        </Text>
                        <Text style={styles.paragraph}>
                            3.5. Em caso de eventual dúvida após a leitura dos presentes Termos e Condições de Uso, solicitamos entrar em contato conosco através do e-mail <Text style={styles.linkText}>contato@dunoup.com.br</Text>.
                        </Text>

                        {/* 4. OS SERVIÇOS */}
                        <Text style={styles.sectionTitle}>4. OS SERVIÇOS</Text>
                        <Text style={styles.paragraph}>
                            4.1. Os SERVIÇOS são aqueles que integram a PLATAFORMA e permitem a Você, usuário da PLATAFORMA ou do Site/Aplicativo da DUNO, solicitar e programar serviços de climatização, segurança eletrônica, telecomunicação, manutenção de elevadores, provedores de internet, dedetização, desentupidoras, e/ou qualquer outro segmento de prestação de serviços com os quais a DUNO venha se relacionar, através de terceiros independentes que possuem contrato com a DUNO, a qual apenas fornece a tecnologia necessária ao agendamento e gestão dos referidos SERVIÇOS.
                        </Text>
                        <View style={styles.alertBox}>
                            <Text style={styles.alertText}>
                                4.2. VOCÊ RECONHECE QUE A DUNO NÃO É FORNECEDORA DE BENS E NÃO PRESTA SERVIÇOS DE CLIMATIZAÇÃO, SEGURANÇA ELETRÔNICA, TELECOMUNICAÇÃO, ELEVADORES, PROVEDORES DE INTERNET, DEDETIZAÇÃO, DESENTUPIDORAS E/OU QUALQUER OUTRO SEGMENTO DE PRESTAÇÃO DE SERVIÇOS COM OS QUAIS A DUNO VENHA SE RELACIONAR, ATRAVÉS DE TERCEIROS INDEPENDENTES QUE POSSUEM CONTRATO COM A DUNO, E QUE TODOS ESSES SERVIÇOS SÃO PRESTADOS POR PARCEIROS INDEPENDENTES, QUE NÃO SÃO EMPREGADOS(AS) E NEM REPRESENTANTES DA DUNO.
                            </Text>
                        </View>

                        {/* 5. LICENÇA */}
                        <Text style={styles.sectionTitle}>5. LICENÇA</Text>
                        <Text style={styles.paragraph}>
                            5.1. Sujeito ao cumprimento destes Termos, a DUNO concede ao Licenciado uma licença revogável, não exclusiva, não passível de sublicença, intransferível para uso da PLATAFORMA e do Aplicativo em seu dispositivo pessoal, exclusivamente para acesso aos Serviços.
                        </Text>
                        <Text style={styles.paragraph}>
                            5.2. O SOFTWARE não pode ser utilizado para qualquer outra finalidade que não seja o processamento de suas informações ou de representantes legais de pessoas jurídicas indicadas pelo LICENCIADO, no ato do cadastramento. Quaisquer direitos não expressamente outorgados por estes Termos são reservados à DUNO.
                        </Text>
                        <Text style={styles.paragraph}>
                            5.3. Em nenhuma hipótese será fornecido acesso ao código fonte do SOFTWARE, por este se tratar de propriedade intelectual da DUNO.
                        </Text>
                        <Text style={styles.paragraph}>
                            5.4. Você se compromete a não adotar qualquer espécie de procedimento que implique a engenharia reversa, descompilação, desmontagem, tradução, adaptação e/ou modificação no SOFTWARE, ou qualquer outra medida que possibilite o acesso ao código fonte, sob pena de responder pelas perdas e danos causadas à DUNO.
                        </Text>

                        {/* 6. RESTRIÇÕES */}
                        <Text style={styles.sectionTitle}>6. RESTRIÇÕES</Text>
                        <Text style={styles.paragraph}>
                            6.1. As condutas descritas a seguir são proibidas na PLATAFORMA:
                        </Text>
                        <View style={styles.definitionBox}>
                            <Text style={styles.bulletItem}>6.1.1. Remover qualquer aviso de direito autoral, direito de marca ou outro aviso de direito de propriedade de qualquer parte dos Serviços;</Text>
                            <Text style={styles.bulletItem}>6.1.2. Modificar, preparar obras derivadas, distribuir, licenciar, copiar, ceder, sublicenciar, vender, revender, dar em locação ou em garantia, reproduzir, doar, alienar de qualquer forma, transferir total ou parcialmente, exibir, veicular, transmitir, conectar, espelhar ou recortar qualquer parte dos Serviços ou, de qualquer outro modo, explorar Serviços, sob quaisquer modalidades, gratuita ou onerosamente, provisória ou permanentemente, no “SOFTWARE”, assim como seus módulos, partes, manuais ou quaisquer informações a ele relativas;</Text>
                            <Text style={styles.bulletItem}>6.1.3. Retirar ou alterar, total ou parcialmente, os avisos de reserva de direito existente no SOFTWARE e na documentação;</Text>
                            <Text style={styles.bulletItem}>6.1.4. Fazer ou lançar quaisquer programas ou scripts com a finalidade de sobrecarregar ou prejudicar indevidamente a operação e/ou funcionalidade de qualquer aspecto dos Serviços; ou</Text>
                            <Text style={styles.bulletItem}>6.1.5. Tentar obter acesso não autorizado aos Serviços ou prejudicar qualquer aspecto dos Serviços ou seus sistemas ou redes correlatas;</Text>
                            <Text style={styles.bulletItem}>6.1.6. Inserir no SOFTWARE e PLATAFORMA conteúdo que viola a legislação vigente.</Text>
                        </View>

                        {/* 7. PRESTAÇÃO DOS SERVIÇOS */}
                        <Text style={styles.sectionTitle}>7. PRESTAÇÃO DOS SERVIÇOS</Text>
                        <Text style={styles.paragraph}>
                            7.1. Você reconhece que os Serviços podem ser disponibilizados sob diferentes marcas e formatos de solicitações associados aos Parceiros Independentes, os quais são os únicos responsáveis por determinar a forma de prestação de serviços, prazos, valores, garantias etc., sem qualquer interferência ou ingerência da DUNO.
                        </Text>
                        <Text style={styles.paragraph}>
                            7.2. Os Serviços são disponibilizados e fornecidos por terceiros(as) sobre os quais a DUNO não controlará. VOCÊ RECONHECE QUE TERMOS DE USO E POLÍTICAS DE PRIVACIDADE DIFERENTES PODERÃO SER APLICÁVEIS AO USO DESSES SERVIÇOS E CONTEÚDO DE TERCEIROS(AS). A DUNO NÃO ENDOSSA ESSES SERVIÇOS E CONTEÚDO DE TERCEIROS(AS) E NÃO SERÁ, EM HIPÓTESE ALGUMA, RESPONSÁVEL POR NENHUM PRODUTO OU SERVIÇO DESSES(AS) TERCEIROS(AS) FORNECEDORES(AS).
                        </Text>

                        {/* 8. CONDIÇÕES GERAIS DE ACESSO E UTILIZAÇÃO DA PLATAFORMA */}
                        <Text style={styles.sectionTitle}>8. CONDIÇÕES GERAIS DE ACESSO E UTILIZAÇÃO DA PLATAFORMA</Text>
                        <Text style={styles.paragraph}>
                            8.1. O acesso à Plataforma somente será liberado à LICENCIADA e seus FORNECEDORES após o preenchimento, por completo, de todos os dados cadastrais, efetivação do contrato de licença de software e fornecimento de todas as informações obrigatórias solicitadas pela DUNO, a qual oferecerá criação do respectivo login e da senha.
                        </Text>
                        <Text style={styles.paragraph}>
                            8.2. Você será o único e exclusivo responsável pelos dados e informações fornecidos por ocasião de seu cadastramento na Plataforma, ficando plenamente ciente de que a DUNO não se responsabilizará por quaisquer informações incorretas e/ou inverídicas fornecidas pelo Usuário, que também terá inteira responsabilidade em manter atualizadas todas suas informações pessoais e de contato, em especial seu e-mail, endereço e telefone(s).
                        </Text>
                        <Text style={styles.paragraph}>
                            8.3. O Usuário reconhece que, independentemente de qualquer formalidade, seu acesso à Plataforma poderá vir a ser cancelado, caso seja constatado que houve fornecimento de informações incorretas e/ou inverídicas em seu cadastro; em decorrência deste cancelamento, nada será devido pela DUNO.
                        </Text>
                        <Text style={styles.paragraph}>
                            8.4. Será de exclusiva responsabilidade do Usuário a segurança do login e da senha cadastrada, não devendo ser compartilhada com terceiros, sendo o Usuário o único responsável na hipótese de utilização inadequada em razão de acessos indevidos.
                        </Text>
                        <Text style={styles.paragraph}>
                            8.5. Se ocorrer suspeita de conhecimento da senha por terceiros, o Usuário deverá comunicar imediatamente tal fato à DUNO, para fins de substituição das informações de acesso. Considerando que o login e a senha são pessoais e intransferíveis, a DUNO desde logo reserva o direito de cancelar o acesso do Usuário à Plataforma se esses dados forem utilizados por terceiros ou indevidamente.
                        </Text>
                        <Text style={styles.paragraph}>
                            8.6. O Usuário declara ter plena ciência de que o mero cadastramento no Site não implicará acesso ao Sistema da DUNO; tal acesso somente será liberado após a efetivação dos trâmites de licenciamento de SOFTWARE e comprovado o pagamento previsto no Contrato.
                        </Text>
                        <Text style={styles.paragraph}>
                            8.7. A qualidade do serviço fornecido na Plataforma dependerá da funcionalidade simultânea de vários fatores, alguns deles alheios ao controle da DUNO, tais como, por exemplo, a adequação dos equipamentos do Usuário, a interação de servidores e serviços de telecomunicações de terceiros, dentre outros, competindo a Você observar os requisitos para ter acesso ao sistema com a qualidade almejada.
                        </Text>

                        {/* 9. TITULARIDADE */}
                        <Text style={styles.sectionTitle}>9. TITULARIDADE</Text>
                        <Text style={styles.paragraph}>
                            9.1. Os Serviços e todos os direitos sobre eles são e permanecerão de propriedade da DUNO ou de suas respectivas LICENCIADORAS, conforme o caso.
                        </Text>
                        <Text style={styles.paragraph}>
                            9.2. Os Presentes Termos e Condições de Uso não lhe outorgam nem lhe conferem qualquer direito: (i) sobre os Serviços, exceto pela licença limitada concedida acima; ou (ii) de usar ou, de qualquer modo, fazer referência a nomes societários, logotipos, nomes de produtos ou de Serviços, marcas comerciais ou marcas de serviço da DUNO.
                        </Text>

                        {/* 10. NORMAS DE CONDUTA E PROTEÇÃO À PROPRIEDADE IMATERIAL */}
                        <Text style={styles.sectionTitle}>10. NORMAS DE CONDUTA E PROTEÇÃO À PROPRIEDADE IMATERIAL</Text>
                        <Text style={styles.paragraph}>
                            10.1. Você e o LICENCIADO não adquirem, pelo instrumento de contrato ou pela utilização do SOFTWARE, nenhum direito de propriedade intelectual ou outros direitos exclusivos, incluindo patentes, desenhos, marcas, direitos autorais ou quaisquer direitos sobre informações confidenciais ou segredos de negócio, bem como todo o conteúdo disponibilizado no Site e PLATAFORMA, incluindo, mas não se limitando a textos, gráficos, imagens, logotipos, ícones, fotografias, conteúdo editorial, notificações, softwares e qualquer outro material, sobre ou relacionados ao SOFTWARE ou nenhuma parte dele.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.2. O LICENCIADO também não adquire nenhum direito sobre ou relacionado ao SOFTWARE ou qualquer componente dele, além dos direitos expressamente licenciados ao LICENCIADO sob os presentes Termos e Condições de Uso ou em qualquer outro contrato mutuamente firmado.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.3. É de propriedade exclusiva da DUNO ou está devidamente licenciado, todo o conteúdo disponibilizado no Site e PLATAFORMA, incluindo, mas não se limitando a, textos, gráficos, imagens, logos, ícones, fotografias, conteúdo editorial, notificações, softwares e qualquer outro material.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.4. Considerando o alcance mundial da Internet, Você concorda em cumprir toda e qualquer legislação do local onde está situado, bem como todas as leis vigentes na sede do “DUNO”, no Brasil; obriga-se, ainda, a respeitar o disposto nos presentes Termos e Condições de Uso, na Política de Privacidade e no Contrato.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.5. Você se obriga e se compromete a não produzir, reproduzir, disponibilizar, divulgar e/ou transmitir qualquer tipo de conteúdo que:
                        </Text>
                        <View style={styles.definitionBox}>
                            <Text style={styles.bulletItem}>10.5.1. Contrarie qualquer norma da legislação brasileira, a moral e os bons costumes normalmente aceitos, ou que incentive qualquer forma de racismo, discriminação ou violência;</Text>
                            <Text style={styles.bulletItem}>10.5.2. Disponibilize ou promova o acesso, por meio de links, a material delituoso, violento, pornográfico, racista, preconceituoso ou que explore e divulgue imagem e informação de menores de 18 (dezoito) anos;</Text>
                            <Text style={styles.bulletItem}>10.5.3. Divulgue material que implique em calúnia, difamação, injúria, ameaça ou que induzam ao racismo ou discriminação;</Text>
                            <Text style={styles.bulletItem}>10.5.4. Viole, por qualquer forma, segredos empresariais da DUNO ou de terceiros ou divulgar informações protegidas por sigilo;</Text>
                            <Text style={styles.bulletItem}>10.5.5. Veicule informações ou arquivos que sejam caracterizados como publicidade enganosa ou abusiva;</Text>
                            <Text style={styles.bulletItem}>10.5.6. Faça upload, publique, envie por e-mail, transmita ou disponibilize conteúdo que infrinja qualquer patente, marca registrada, segredo comercial, direitos autorais ou outros direitos de propriedade de terceiros, sem que tenha obtido dos respectivos titulares a prévia autorização necessária para o uso que irá realizar ou que pretender realizar;</Text>
                            <Text style={styles.bulletItem}>10.5.7. Incorporem códigos maliciosos ou quaisquer outros elementos físicos e/ou eletrônicos capazes de produzir danos e/ou impedir o funcionamento normal da rede, do sistema ou dos equipamentos informáticos (hardware e software) da DUNO ou de terceiros, ou que possam acarretar prejuízos aos documentos eletrônicos e arquivos armazenados nos referidos equipamentos;</Text>
                            <Text style={styles.bulletItem}>10.5.8. Provoquem, em decorrência de suas características (forma, extensão etc.) qualquer dificuldade no funcionamento normal do serviço.</Text>
                        </View>
                        <Text style={styles.paragraph}>
                            10.6. O acesso a áreas restritas da Plataforma, consideradas fechadas, somente será permitido aos Usuários devidamente cadastrados, mediante uso de login e senha. Você declara estar ciente de que, se for constatada alguma falha no sistema que permita o seu acesso a qualquer área restrita da Plataforma, mesmo que por mera tentativa de erro e acerto de senha, ainda assim Você estará sujeito às sanções civis e criminais decorrentes desta sua conduta.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.7. Você poderá colocar fotos em perfil dos prestadores de serviços na Plataforma, ou quando for participar de campanhas promovidas pela DUNO, ocasião em que Você somente poderá inserir fotos de sua autoria e não poderá inserir fotos de nudez ou outro material protegido por direitos autorais e de imagem.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.8. Todo o Conteúdo divulgado na Plataforma, tais como marcas, logotipos, ícones, desenhos, sons, layouts, algoritmos, vídeos, arquivos, textos, materiais didáticos, incluindo os Cursos, são de propriedade exclusiva do DUNO, ou de terceiros que concederam autorização para tal uso, e estão protegidos por leis e tratados internacionais. Sendo assim, fica vedada sua cópia, reprodução ou qualquer outro tipo de utilização indevida. Os infratores ficarão sujeitos às sanções civis e criminais decorrentes, nos termos das Leis 9.279/96, 9.609/98 e 9.610/98.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.9. Você se compromete a usar a Plataforma e todo o conteúdo nela disponibilizado de acordo com o ordenamento jurídico brasileiro, com a moral, com os bons costumes geralmente aceitos, com estes Termos e Condições de Uso, com a Política de Privacidade, com o Contrato e com as demais instruções divulgadas na Plataforma. Você deverá se abster de usar, explorar, reproduzir ou divulgar indevidamente, por qualquer meio, o Conteúdo colocado à disposição na Plataforma.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.10. Todas as marcas, nomes comerciais e/ou logotipos de qualquer espécie, disponibilizados na Plataforma, são de propriedade da DUNO e/ou de seus LICENCIADOS. O uso da Plataforma não poderá ser entendido como autorização para que Você possa mencionar tais marcas, nomes comerciais e/ou logotipos sem a devida autorização.
                        </Text>
                        <Text style={styles.paragraph}>
                            10.11. Caso Você tenha dúvida sobre as normas de conduta, poderá entrar em contato conosco pelo e-mail <Text style={styles.linkText}>contato@dunoup.com.br</Text>.
                        </Text>

                        {/* 11. PROCEDIMENTO EM CASO DE CONSTATAÇÃO DE ABUSOS OU IRREGULARIDADES */}
                        <Text style={styles.sectionTitle}>11. PROCEDIMENTO EM CASO DE CONSTATAÇÃO DE ABUSOS OU IRREGULARIDADES</Text>
                        <Text style={styles.paragraph}>
                            11.1. Se Você identificar qualquer material ofensivo, ilegal, ou atentatório à moral e aos bons costumes, inserido por outro Usuário da Plataforma, Você poderá comunicar imediatamente à DUNO, através do envio de mensagem ao e-mail <Text style={styles.linkText}>contato@dunoup.com.br</Text>, para que a denúncia possa ser apurada. A DUNO ficará isenta de qualquer responsabilidade pela inserção de tal conteúdo, uma vez que foi realizado por terceiros, sem qualquer intervenção ou controle de sua parte, aplicando-se o disposto no artigo 19, da Lei 12.965/14 (Marco Civil da Internet).
                        </Text>
                        <Text style={styles.paragraph}>
                            11.2. Ficará ao critério único e exclusivo da administração da DUNO a apuração das denúncias que eventualmente lhe forem encaminhadas.
                        </Text>
                        <Text style={styles.paragraph}>
                            11.3. Sem prejuízo da adoção das medidas judiciais cabíveis, eventual comportamento ilícito autorizará a DUNO a realizar a suspensão, bloqueio ou o cancelamento do cadastro do Usuário na Plataforma, independentemente de aviso prévio.
                        </Text>

                        {/* 12. DURAÇÃO E FINALIZAÇÃO DO ACESSO À PLATAFORMA */}
                        <Text style={styles.sectionTitle}>12. DURAÇÃO E FINALIZAÇÃO DO ACESSO À PLATAFORMA</Text>
                        <Text style={styles.paragraph}>
                            12.1. Você poderá ter acesso à plataforma pelo prazo do Plano contratado pelo LICENCIADO, o qual poderá ser automaticamente renovado por iguais períodos caso o LICENCIADO não se manifeste expressamente em contrário.
                        </Text>
                        <Text style={styles.paragraph}>
                            12.2. A DUNO, ainda, se reserva o direito de recusar ou retirar o acesso à Plataforma, a qualquer momento, e sem necessidade de prévio aviso, por iniciativa própria ou por exigência de um terceiro, se Você descumprir, de qualquer forma, estes Termos de Uso, a Política de Privacidade, o Contrato e/ou a legislação vigente.
                        </Text>

                        {/* 13. EXCLUSÃO DE GARANTIAS E DE RESPONSABILIDADE DO DUNO */}
                        <Text style={styles.sectionTitle}>13. EXCLUSÃO DE GARANTIAS E DE RESPONSABILIDADE DO DUNO</Text>
                        <Text style={styles.paragraph}>
                            13.1. Em nenhuma hipótese, a DUNO será responsável por quaisquer danos patrimoniais e extrapatrimoniais que possam ser sofridos por Você:
                        </Text>
                        <View style={styles.definitionBox}>
                            <Text style={styles.bulletItem}>13.1.1. Por falha de operação, operação por pessoas não autorizadas ou qualquer outra causa em que não exista culpa direta da DUNO;</Text>
                            <Text style={styles.bulletItem}>13.1.2. Por eventual incompatibilidade do SOFTWARE com outros programas de computador instalados por Você ou no parque computacional da LICENCIADA;</Text>
                            <Text style={styles.bulletItem}>13.1.3. Interrupção, suspensão temporária ou definitiva dos SERVIÇOS da DUNO em virtude de modificações ou reparos necessários ao SOFTWARE/PLATAFORMA;</Text>
                            <Text style={styles.bulletItem}>13.1.4. Pelos danos ou prejuízos decorrentes de decisões administrativas, gerenciais ou comerciais tomadas com base nas informações fornecidas no SOFTWARE;</Text>
                            <Text style={styles.bulletItem}>13.1.5. Em razão de casos fortuitos e de força maior que possam de algum modo afetar a realização plena dos serviços ora contratados, conforme art. 393, Código civil, como, por exemplo, em caso de paralisação ou interrupção decorrente de determinação do Poder Público, pandemia, greves, dentre outros;</Text>
                            <Text style={styles.bulletItem}>13.1.6. Por dificuldades técnicas relacionadas à rede, internet, backup, hardware, software de terceiros ou quaisquer outros incidentes que não estejam diretamente relacionados à PLATAFORMA;</Text>
                            <Text style={styles.bulletItem}>13.1.7. Por eventuais problemas oriundos de ações de terceiros que possam interferir na qualidade da PLATAFORMA ou SERVIÇOS;</Text>
                        </View>
                        <Text style={styles.paragraph}>
                            13.2. Em nenhum caso a DUNO será responsável por danos pessoais ou qualquer prejuízo incidental, especial, indireto ou consequente, incluindo, sem limitação, prejuízos por perda de lucro, corrupção ou perda de dados, falha de transmissão ou recepção de dados, não continuidade do negócio ou qualquer outro prejuízo ou perda comercial, decorrentes ou relacionados ao seu uso ou sua inabilidade em usar o SOFTWARE, por qualquer outro motivo.
                        </Text>
                        <Text style={styles.paragraph}>
                            13.3. A DUNO adota as medidas de segurança adequadas de acordo com os padrões de mercado para a proteção das INFORMAÇÕES do LICENCIADO armazenadas no SOFTWARE. Contudo, o LICENCIADO reconhece que nenhum sistema, servidor ou software está absolutamente imune a ataques e/ou invasões de crackers e outros agentes maliciosos, não sendo a DUNO responsável por qualquer exclusão, obtenção, utilização ou divulgação não autorizada de INFORMAÇÕES resultantes de ataques que a DUNO não poderia razoavelmente evitar por meio dos referidos padrões de segurança.
                        </Text>
                        <Text style={styles.paragraph}>
                            13.4. A DUNO utilizará as melhores práticas de mercado recomendadas, de modo a manter seguros todos os dados inseridos por Você na Plataforma. No entanto, a DUNO se exime de qualquer responsabilidade por eventuais danos e prejuízos, de qualquer natureza, decorrentes do conhecimento que terceiros não autorizados tenham de informações passadas por Você, em virtude de falha exclusivamente atribuível a Você ou a terceiros, da presença de vírus ou de outros elementos nocivos na Plataforma que fujam a qualquer controle razoável por parte da DUNO.
                        </Text>
                        <Text style={styles.paragraph}>
                            13.5. A DUNO poderá, sem que seja necessária a anuência ou consentimento do Usuário, realizar quaisquer modificações na Plataforma que julgar necessárias, sem que qualquer valor ou indenização seja devida a Você em razão dessas alterações.
                        </Text>

                        {/* 14. DISPOSIÇÕES FINAIS E ATUALIZAÇÕES */}
                        <Text style={styles.sectionTitle}>14. DISPOSIÇÕES FINAIS E ATUALIZAÇÕES DOS PRESENTES TERMOS E CONDIÇÕES DE USO</Text>
                        <Text style={styles.paragraph}>
                            14.1. Você reconhece que, ao acessar a Plataforma, clicar nos itens de aceitação dos termos lá contidos e utilizar quaisquer de suas funcionalidades, manifesta a sua vontade de forma livre, expressa, informada e inequívoca, declarando sua plena, integral e irrestrita concordância com as cláusulas e condições ali previstas.
                        </Text>
                        <Text style={styles.paragraph}>
                            14.2. A tolerância relativamente ao descumprimento de qualquer das obrigações ora assumidas não será considerada novação ou renúncia a qualquer direito, constituindo mera liberalidade que não impedirá a exigência quanto ao fiel cumprimento destes Termos e Condições de Uso, a qualquer tempo.
                        </Text>
                        <Text style={styles.paragraph}>
                            14.3. O LICENCIADO não poderá prestar serviços a terceiros utilizando o SOFTWARE da DUNO sem autorização prévia e expressa da DUNO. A autorização de uso do SOFTWARE é fornecida por CNPJ. Desta forma, o SOFTWARE não pode operar sob o regime de multiempresa, necessitando para cada CNPJ uma licença específica;
                        </Text>
                        <Text style={styles.paragraph}>
                            14.4. Caso o LICENCIADO venha a desenvolver um novo módulo ou produto que caracterize cópia, de todo ou em parte, quer seja do dicionário de dados quer seja do programa, será considerado como parte do SOFTWARE fornecido pela DUNO, ficando, portanto, sua propriedade incorporada pela DUNO e seu uso condicionado a estas cláusulas contratuais;
                        </Text>
                        <Text style={styles.paragraph}>
                            14.5. Neste ato, a DUNO expressamente autoriza o LICENCIADO a colher e utilizar seus dados técnicos e operacionais presentes no SOFTWARE, para fins de estudos e melhorias no SOFTWARE;
                        </Text>
                        <Text style={styles.paragraph}>
                            14.6. Fica certo e entendido pelo LICENCIADO que somente a pessoa cadastrada pelo próprio LICENCIADO como administradora de conta poderá solicitar que as informações do LICENCIADO inseridas no Software sejam apagadas. Ainda, o LICENCIADO declara sua ciência de que uma vez apagadas as INFORMAÇÕES, estas não poderão mais ser recuperadas, ficando a DUNO isenta de qualquer responsabilidade por quaisquer perdas ou danos decorrentes deste procedimento solicitado pelo LICENCIADO.
                        </Text>
                        <Text style={styles.paragraph}>
                            14.7. No caso de um tribunal ou juízo competente julgar ilegal, nula ou ineficaz qualquer estipulação destes Termos e Condições de Uso, as previsões restantes permanecerão em plena força e vigor. Caso a estipulação ou estipulações julgadas ilegais, nulas ou ineficazes sejam de ordem a afetar substantivamente o equilíbrio das partes perante o presente acordo, elas deverão negociar, de boa-fé, alternativa que, não contendo os vícios da estipulação ou estipulações invalidadas, reflitam, na maior extensão possível, as suas intenções originárias.
                        </Text>
                        <Text style={styles.paragraph}>
                            14.8. A eventual falha da DUNO em exigir quaisquer direitos e/ou disposições nos presentes Termos e Condições de Uso, não constituirá renúncia, podendo ser exercido regularmente o direito dentro dos prazos legais.
                        </Text>

                        {/* 15. LEGISLAÇÃO E FORO */}
                        <Text style={styles.sectionTitle}>15. LEGISLAÇÃO E FORO</Text>
                        <Text style={styles.paragraph}>
                            15.1. Estes Termos e Condições de Uso serão regidos, interpretados e executados em conformidade com as leis da República Federativa do Brasil, independentemente dos conflitos dessas leis com leis de outros países, para dirimir quaisquer dúvidas ou controvérsias derivadas deste instrumento.
                        </Text>

                        <View style={{ height: 24 }} />
                    </ScrollView>

                    {/* Bottom Action Button */}
                    <View style={[styles.footer, { paddingBottom: bottomPadding }]}>
                        <Pressable 
                            style={({ pressed }) => [
                                styles.closeButton,
                                pressed && styles.closeButtonPressed
                            ]} 
                            onPress={onClose}
                        >
                            <Ionicons name="arrow-back" size={18} color="#ffffff" />
                            <Text style={styles.closeButtonText}>Fechar e Voltar</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'flex-end',
    },
    backdropPressable: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    modalContainer: {
        backgroundColor: '#ffffff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '90%',
        maxHeight: '92%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 20,
        overflow: 'hidden',
    },
    grabHandleContainer: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    grabHandle: {
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#cbd5e1',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 14,
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 12,
        gap: 12,
    },
    headerIconWrapper: {
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
    },
    headerSubtitle: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 2,
    },
    closeIconButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    divider: {
        height: 1,
        backgroundColor: '#e2e8f0',
    },
    scrollView: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 20,
    },
    welcomeBanner: {
        backgroundColor: '#f8fafc',
        borderLeftWidth: 4,
        borderLeftColor: '#1c2d4f',
        borderRadius: 8,
        padding: 14,
        marginBottom: 16,
    },
    welcomeTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1c2d4f',
        marginBottom: 4,
    },
    welcomeSubtitle: {
        fontSize: 13,
        color: '#334155',
        lineHeight: 18,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: '#1c2d4f',
        marginTop: 20,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    paragraph: {
        fontSize: 13,
        color: '#475569',
        lineHeight: 20,
        marginBottom: 10,
        textAlign: 'justify',
    },
    bold: {
        fontWeight: '700',
        color: '#0f172a',
    },
    linkText: {
        color: '#2563eb',
        fontWeight: '600',
    },
    definitionBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    bulletItem: {
        fontSize: 12.5,
        color: '#475569',
        lineHeight: 19,
        marginBottom: 8,
        textAlign: 'justify',
    },
    alertBox: {
        backgroundColor: '#fef2f2',
        borderLeftWidth: 4,
        borderLeftColor: '#ef4444',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    alertText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#991b1b',
        lineHeight: 18,
        textAlign: 'justify',
    },
    footer: {
        paddingHorizontal: 20,
        paddingTop: 14,
        backgroundColor: '#ffffff',
        borderTopWidth: 1,
        borderTopColor: '#e2e8f0',
    },
    closeButton: {
        backgroundColor: '#1c2d4f',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
        shadowColor: '#1c2d4f',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    closeButtonPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.99 }],
    },
    closeButtonText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '700',
    },
});
