package cl.duoc.biblioteca;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Punto de entrada de la API interna de la Biblioteca Duoc.
 *
 * El MISMO fat jar que genera este proyecto corre de dos formas, sin cambiar
 * una linea de codigo ni del pom.xml:
 *
 *   * en tu maquina:  java -jar target/biblioteca-backend-0.0.1-SNAPSHOT.jar
 *   * en AWS Lambda:  el AWS Lambda Web Adapter arranca ese mismo jar y traduce
 *                     cada invocacion a un request HTTP contra localhost:8080
 *                     (ver aws/backend.yaml).
 */
@SpringBootApplication
public class BibliotecaApplication {

    public static void main(String[] args) {
        SpringApplication.run(BibliotecaApplication.class, args);
    }
}
