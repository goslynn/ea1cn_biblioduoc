package cl.duoc.biblioteca.catalogo;

import java.io.IOException;
import java.io.InputStream;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/**
 * El catalogo completo, en memoria.
 *
 * POR QUE NO HAY BASE DE DATOS
 *   El catalogo de esta plataforma es estatico: se publica con la aplicacion y
 *   solo cambia cuando se despliega una version nueva. Cargarlo desde un JSON
 *   del classpath da busqueda instantanea, cero infraestructura que mantener y
 *   un arranque en frio mas corto en Lambda. La evolucion natural (una tabla
 *   real) esta descrita en el README.
 *
 * La lista se lee UNA vez, al construir el bean, y queda inmutable: no hay
 * estado compartido que pueda corromperse entre invocaciones concurrentes de
 * la Lambda.
 */
@Component
public class CatalogoLibros {

    private final List<Libro> libros;

    public CatalogoLibros(ObjectMapper jackson) throws IOException {
        try (InputStream json = new ClassPathResource("libros.json").getInputStream()) {
            this.libros = List.copyOf(jackson.readValue(json, new TypeReference<List<Libro>>() {}));
        }
    }

    /** Todos los libros, ordenados por titulo. */
    public List<Libro> todos() {
        return libros.stream()
                .sorted(Comparator.comparing(Libro::titulo))
                .toList();
    }

    /**
     * Busqueda del catalogo. Los tres filtros se combinan con Y logico y todos
     * son opcionales: sin ninguno, devuelve el catalogo entero.
     *
     * @param texto           busca en titulo, autor e ISBN, sin distinguir
     *                        mayusculas ni tildes ("garcia" encuentra "Garcia")
     * @param genero          coincidencia exacta de genero, sin distinguir mayusculas
     * @param soloDisponibles si es true, descarta los libros sin ejemplares
     */
    public List<Libro> buscar(String texto, String genero, boolean soloDisponibles) {
        String aguja = normalizar(texto);
        String generoBuscado = normalizar(genero);

        return libros.stream()
                .filter(libro -> aguja.isEmpty()
                        || normalizar(libro.titulo()).contains(aguja)
                        || normalizar(libro.autor()).contains(aguja)
                        || normalizar(libro.isbn()).contains(aguja))
                .filter(libro -> generoBuscado.isEmpty()
                        || normalizar(libro.genero()).equals(generoBuscado))
                .filter(libro -> !soloDisponibles || libro.disponible())
                .sorted(Comparator.comparing(Libro::titulo))
                .toList();
    }

    /** Los generos presentes en el catalogo, para poblar el filtro del frontend. */
    public List<String> generos() {
        return libros.stream().map(Libro::genero).distinct().sorted().toList();
    }

    /** Vacio si el id no existe: quien llama decide si eso es un 404. */
    public Optional<Libro> porId(String id) {
        return libros.stream().filter(libro -> libro.id().equalsIgnoreCase(id)).findFirst();
    }

    /**
     * Pasa un texto a minusculas y le quita las tildes, para que la busqueda no
     * dependa de como se escriba el acento. "Gabriel Garcia Marquez" y
     * "garcía márquez" terminan siendo comparables.
     */
    private static String normalizar(String texto) {
        if (texto == null || texto.isBlank()) {
            return "";
        }
        String sinTildes = Normalizer.normalize(texto.trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        return sinTildes.toLowerCase();
    }
}
